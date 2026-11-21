// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDialogHost, confirmDialog, resetAppDialogs, showError, showFriendlyError } from "../src/components/AppDialogs";
import ErrorBoundary from "../src/components/ErrorBoundary";
import LoadErrorPanel from "../src/components/LoadErrorPanel";
import { useDialogAccessibility } from "../src/hooks/useDialogAccessibility";
import { describeError, errorText, explainError, isUserCancellation, safeFilename } from "../src/utils/errors";
import { describeGeminiFailure, geminiEndpoint, geminiHttpError } from "../src/utils/gemini";
import { clearCachedCaseData } from "../src/utils/appStorage";
import { parseLocalDay } from "../src/utils/dates";
import { calculateReportSummary, formatReportDateRange } from "../src/reports/utils/reportCalculations";
import { buildReportData } from "../src/reports/utils/buildReportData";
import type { ReportConfig } from "../src/reports/types/reportTypes";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
let root: Root;
let host: HTMLDivElement;

function Harness({ children }: { children?: React.ReactNode }) {
  useDialogAccessibility();
  return <><button id="trigger">Trigger</button>{children}<AppDialogHost /></>;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function () {
    return [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { resetAppDialogs(); root.unmount(); await flush(); });
  host.remove();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

async function render(node: React.ReactNode) {
  await act(async () => { root.render(node); await flush(); });
}

describe("error text helpers", () => {
  it("extracts messages from strings, errors and objects", () => {
    expect(errorText("plain")).toBe("plain");
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText({ message: "from object" })).toBe("from object");
    expect(errorText(null)).toBe("");
  });

  it("treats native dialog cancellation and aborts as cancellations, not errors", () => {
    expect(isUserCancellation("User cancelled")).toBe(true);
    expect(isUserCancellation(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isUserCancellation("Permission denied (os error 13)")).toBe(false);
    expect(isUserCancellation(null)).toBe(false);
  });

  it("maps technical failures to plain explanations and keeps raw text as details", () => {
    const locked = describeError("database is locked", { title: "Couldn't save", message: "The case was not saved." });
    expect(locked.message).toBe("The case was not saved.");
    expect(locked.reason).toMatch(/busy/i);
    expect(locked.details).toBe("database is locked");

    const constraint = describeError("UNIQUE constraint failed: cases.id", { title: "X", message: "Not saved." });
    expect(constraint.reason).toMatch(/already exists/);

    const sqlite = describeError("rusqlite::Error(Some weird internal)", { title: "X", message: "Fallback." });
    expect(sqlite.message).toBe("Fallback.");
    expect(sqlite.reason).toBeUndefined();
    expect(sqlite.details).toContain("rusqlite");
  });

  it("shows friendly backend sentences as the reason without duplicating them in details", () => {
    const friendly = describeError("Too many incorrect PINs. Please wait one minute and try again.", { title: "Sign in", message: "Your PIN could not be checked." });
    expect(friendly.reason).toBe("Too many incorrect PINs. Please wait one minute and try again.");
    expect(friendly.details).toBeUndefined();
    expect(explainError("Case with id 9 was not found", "Couldn't load.")).toBe("Couldn't load. Case with id 9 was not found.");
  });

  it("does not repeat sentences the message already contains", () => {
    const f = describeError("This file is not a Guidance Office database. Your current data has not changed.", { title: "X", message: "The file could not be imported. Your current data has not changed." });
    expect(f.reason).toBe("This file is not a Guidance Office database.");
  });

  it("produces filenames that are safe on every OS", () => {
    expect(safeFilename('Report 10/13/2026: "A" <B>?')).toBe("Report 10_13_2026_ _A_ _B_");
    expect(safeFilename("...")).toBe("document");
  });

  it("parses date-only strings as local calendar days", () => {
    const day = parseLocalDay("2026-01-01")!;
    expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 0, 1]);
    expect(parseLocalDay("not a date")).toBeNull();
  });
});

describe("Gemini failure mapping", () => {
  it("identifies invalid, expired and revoked keys", () => {
    const invalid = geminiHttpError(400, JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }));
    expect(invalid.isKeyProblem).toBe(true);
    expect(invalid.friendly.message).toMatch(/not valid/);
    expect(invalid.friendly.details).toContain("HTTP 400");

    expect(geminiHttpError(400, "API key expired. Please renew the API key.").friendly.message).toMatch(/expired/);
    expect(geminiHttpError(403, "PERMISSION_DENIED").isKeyProblem).toBe(true);
  });

  it("explains quota, outage, timeout and offline failures", () => {
    expect(geminiHttpError(429, "RESOURCE_EXHAUSTED").friendly.message).toMatch(/limit/);
    expect(geminiHttpError(503, "").friendly.message).toMatch(/temporarily unavailable/);
    expect(geminiHttpError(400, "bad request").isKeyProblem).toBe(false);
    expect(describeGeminiFailure(new DOMException("t", "TimeoutError")).message).toMatch(/too long/);
    expect(describeGeminiFailure(new TypeError("Failed to fetch")).message).toMatch(/could not reach/);
  });

  it("encodes the API key in the request URL", () => {
    expect(geminiEndpoint(" a&b ", "streamGenerateContent")).toContain("alt=sse&key=a%26b");
  });
});

describe("app error dialog", () => {
  it("renders an accessible alertdialog with reason, guidance and collapsible technical details", async () => {
    await render(<Harness />);
    await act(async () => {
      showError("disk I/O error (os error 28)", { title: "Couldn't create the backup", message: "The backup could not be written." });
      await flush();
    });
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Couldn't create the backup");
    expect(dialog.textContent).toContain("The backup could not be written.");
    expect(dialog.textContent).toContain("Reason:");
    expect(dialog.querySelector("details summary")!.textContent).toBe("Technical details");
    expect(dialog.querySelector("pre")!.textContent).toContain("os error 28");
    expect(host.inert).toBe(true);
    // Focus moves into the dialog (first visible control).
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes with Escape and restores the page", async () => {
    await render(<Harness />);
    await act(async () => { showError("x", { title: "Failed" }); await flush(); });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
    });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.inert).toBe(false);
  });

  it("offers Try Again that runs the retry callback", async () => {
    const retry = vi.fn();
    await render(<Harness />);
    await act(async () => { showError("timeout", { title: "Failed", onRetry: retry }); await flush(); });
    const button = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Try Again"))!;
    await act(async () => { button.click(); await flush(); });
    expect(retry).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("ignores user cancellations and de-duplicates identical failures", async () => {
    await render(<Harness />);
    await act(async () => {
      expect(showError("User cancelled", { title: "Nope" })).toBe(false);
      showFriendlyError({ title: "Same", message: "Same failure." });
      showFriendlyError({ title: "Same", message: "Same failure." });
      await flush();
    });
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Nope");
  });

  it("confirmation resolves true on confirm and false on cancel or Escape", async () => {
    await render(<Harness />);
    let first!: Promise<boolean>;
    await act(async () => { first = confirmDialog({ title: "Delete?", message: "Gone forever.", confirmLabel: "Delete", tone: "danger" }); await flush(); });
    const confirm = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Delete")!;
    await act(async () => { confirm.click(); await flush(); });
    await expect(first).resolves.toBe(true);

    let second!: Promise<boolean>;
    await act(async () => { second = confirmDialog({ title: "Replace?", message: "Sure?", cancelLabel: "Keep current" }); await flush(); });
    expect(document.activeElement?.textContent).toBe("Keep current"); // safe default focus
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
    });
    await expect(second).resolves.toBe(false);
  });
});

describe("crash and load-failure recovery screens", () => {
  function Bomb({ explode }: { explode: boolean }) {
    if (explode) throw new Error("render exploded");
    return <p id="ok">Fine</p>;
  }

  it("page boundary shows a recovery screen instead of a blank page and recovers on Try Again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let setOuter!: (v: boolean) => void;
    function Outer() {
      const [explode, set] = useState(true);
      setOuter = set;
      return <ErrorBoundary variant="page"><Bomb explode={explode} /></ErrorBoundary>;
    }
    await render(<Outer />);
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("Something went wrong");
    expect(host.querySelector("pre")!.textContent).toContain("render exploded");
    await act(async () => { setOuter(false); await flush(); });
    const tryAgain = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Try Again"))!;
    await act(async () => { tryAgain.click(); await flush(); });
    expect(host.querySelector("#ok")).not.toBeNull();
  });

  it("resets when the route key changes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await render(<ErrorBoundary variant="page" resetKey="/a"><Bomb explode /></ErrorBoundary>);
    expect(host.textContent).toContain("Something went wrong");
    await render(<ErrorBoundary variant="page" resetKey="/b"><Bomb explode={false} /></ErrorBoundary>);
    expect(host.querySelector("#ok")).not.toBeNull();
  });

  it("load error panel explains the failure and retries", async () => {
    const retry = vi.fn();
    await render(<LoadErrorPanel title="Case records could not be loaded" error="database is locked" onRetry={retry} />);
    expect(host.textContent).toContain("busy");
    const button = host.querySelector("button")!;
    await act(async () => { button.click(); await flush(); });
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("cached data cleanup after reset/restore", () => {
  it("removes staged imports, drafts, cached proofs and catalog filters but keeps preferences", () => {
    const changed = vi.fn();
    window.addEventListener("cases:changed", changed);
    localStorage.setItem("lc_pending_import_rows", "[]");
    localStorage.setItem("new_case_draft", "{}");
    localStorage.setItem("case_proofs_12", "[]");
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("case_catalog_search", "ana");
    sessionStorage.setItem("selected_school_year", "2024-2025");
    clearCachedCaseData();
    expect(localStorage.getItem("lc_pending_import_rows")).toBeNull();
    expect(localStorage.getItem("new_case_draft")).toBeNull();
    expect(localStorage.getItem("case_proofs_12")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(sessionStorage.length).toBe(0);
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("cases:changed", changed);
  });
});

describe("reports with no data", () => {
  const config: ReportConfig = {
    scope: "all", selectedGrade: "Grade 7", status: "all", startDate: "", endDate: "", paperSize: "A4",
    includes: { summary: true, signature: false },
    columns: { date: true, student: true, class: true, adviser: true, type: true, description: true, sanction: true, status: true },
    signatureConfig: { sig1: { show: false, label: "", title: "" }, sig2: { show: false, label: "", title: "" } },
  };

  it("never produces NaN or crashes for an empty period", () => {
    expect(calculateReportSummary([])).toEqual({ total: 0, pending: 0, resolved: 0, reprimand: 0, closed: 0 });
    const data = buildReportData(config, []);
    expect(data.rows).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("NaN");
    expect(formatReportDateRange("", "", [])).not.toContain("NaN");
  });
});
