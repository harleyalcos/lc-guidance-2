import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { describeError, ErrorContext, FriendlyError, isUserCancellation } from "../utils/errors";

/**
 * App-wide error and confirmation dialogs.
 *
 * `showError()` and `confirmDialog()` can be called from any component, hook or
 * utility; the single `<AppDialogHost />` mounted at the app root renders them.
 * Dialogs use role="alertdialog" + aria-modal so `useDialogAccessibility`
 * provides focus trapping, Escape-to-close and focus restoration.
 */

export interface ErrorDialogOptions extends ErrorContext {
  /** Offer a "Try Again" button that runs this callback after closing. */
  onRetry?: () => void;
  /** Label for the dismiss button (default "Close"). */
  closeLabel?: string;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  /** Extra note shown under the message (e.g. "This cannot be undone."). */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  icon?: string;
}

type DialogRequest =
  | { kind: "error"; id: number; content: FriendlyError; onRetry?: () => void; closeLabel?: string }
  | { kind: "confirm"; id: number; options: ConfirmDialogOptions; resolve: (value: boolean) => void };

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return queue;
}

function dismiss(id: number) {
  queue = queue.filter((request) => request.id !== id);
  emit();
}

/**
 * Show the standard error dialog. User cancellations (closing a native file
 * dialog, aborted requests) are ignored so they never surface as errors.
 * Returns false when the error was treated as a cancellation.
 */
export function showError(error: unknown, options: ErrorDialogOptions): boolean {
  if (isUserCancellation(error)) return false;
  return showFriendlyError(describeError(error, options), options);
}

/** Show an error whose explanation has already been prepared (e.g. Gemini HTTP failures). */
export function showFriendlyError(content: FriendlyError, options: Pick<ErrorDialogOptions, "onRetry" | "closeLabel"> = {}): boolean {
  // Avoid stacking identical dialogs for repeated failures (e.g. polling).
  const duplicate = queue.some(
    (request) =>
      request.kind === "error" &&
      request.content.title === content.title &&
      request.content.message === content.message &&
      request.content.reason === content.reason &&
      request.content.details === content.details,
  );
  if (!duplicate) {
    queue = [...queue, { kind: "error", id: nextId++, content, onRetry: options.onRetry, closeLabel: options.closeLabel }];
    emit();
  }
  return true;
}

/** Ask the user to confirm an action with an in-app dialog. Resolves to true on confirm. */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { kind: "confirm", id: nextId++, options, resolve }];
    emit();
  });
}

/** Test helper: close every open dialog (pending confirmations resolve to false). */
export function resetAppDialogs() {
  for (const request of queue) if (request.kind === "confirm") request.resolve(false);
  queue = [];
  emit();
}

function ErrorDialog({ request }: { request: Extract<DialogRequest, { kind: "error" }> }) {
  const { content } = request;
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const close = () => dismiss(request.id);
  const retry = () => {
    dismiss(request.id);
    request.onRetry?.();
  };
  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(`${content.title}\n${content.message}\n${content.reason ?? ""}\n\n${content.details ?? ""}`.trim());
      setCopied("done");
    } catch {
      // Clipboard can be unavailable; tell the user instead of failing silently.
      setCopied("failed");
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`app-error-title-${request.id}`}
      aria-describedby={`app-error-message-${request.id}`}
      tabIndex={-1}
      className="relative bg-surface dark:bg-surface-container p-6 rounded-2xl shadow-xl max-w-md w-full border border-outline-variant modal-panel-enter"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-error/10 text-error flex items-center justify-center" aria-hidden="true">
          <span className="material-symbols-outlined text-[24px]">error</span>
        </div>
        <h2 id={`app-error-title-${request.id}`} className="text-lg font-bold text-on-surface leading-snug pt-1.5">
          {content.title}
        </h2>
      </div>
      <p id={`app-error-message-${request.id}`} className="text-sm text-on-surface leading-relaxed mb-2 whitespace-pre-line">
        {content.message}
      </p>
      {content.reason && (
        <p className="text-sm text-on-surface leading-relaxed mb-2">
          <span className="font-semibold">Reason: </span>
          <span className="whitespace-pre-line">{content.reason}</span>
        </p>
      )}
      {content.guidance && (
        <p className="text-sm text-secondary leading-relaxed mb-4 flex gap-2">
          <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">lightbulb</span>
          <span>{content.guidance}</span>
        </p>
      )}
      {content.details && (
        <details className="mb-4 rounded-xl border border-outline-variant bg-surface-container-low">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-secondary">Technical details</summary>
          <div className="px-3 pb-3">
            <pre className="text-[11px] font-mono text-error whitespace-pre-wrap break-all max-h-40 overflow-auto">{content.details}</pre>
            <button type="button" onClick={copyDetails} className="mt-2 text-xs font-semibold text-primary hover:underline">
              {copied === "done" ? "Copied" : copied === "failed" ? "Copy unavailable — select the text instead" : "Copy details"}
            </button>
          </div>
        </details>
      )}
      <div className="flex items-center justify-end gap-3 mt-2">
        {request.onRetry && (
          <button type="button" onClick={retry} className="btn-secondary px-4 whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span>
            <span>Try Again</span>
          </button>
        )}
        <button type="button" data-dialog-cancel onClick={close} className="btn-primary px-4 whitespace-nowrap">
          <span>{request.closeLabel ?? "Close"}</span>
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({ request }: { request: Extract<DialogRequest, { kind: "confirm" }> }) {
  const { options } = request;
  const danger = options.tone === "danger";
  const answer = (value: boolean) => {
    dismiss(request.id);
    request.resolve(value);
  };
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`app-confirm-title-${request.id}`}
      aria-describedby={`app-confirm-message-${request.id}`}
      tabIndex={-1}
      className="relative bg-surface dark:bg-surface-container p-6 rounded-2xl shadow-xl max-w-md w-full border border-outline-variant modal-panel-enter"
    >
      <div className={`flex items-center gap-3 mb-3 ${danger ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
        <span className="material-symbols-outlined text-[28px]" aria-hidden="true">{options.icon ?? (danger ? "warning" : "help")}</span>
        <h2 id={`app-confirm-title-${request.id}`} className="text-lg font-bold text-on-surface">{options.title}</h2>
      </div>
      <p id={`app-confirm-message-${request.id}`} className="text-secondary text-sm leading-relaxed whitespace-pre-line">{options.message}</p>
      {options.detail && <p className="text-sm font-semibold text-on-surface mt-3">{options.detail}</p>}
      <div className="flex items-center justify-end gap-3 mt-6">
        <button type="button" data-dialog-cancel onClick={() => answer(false)} className="btn-secondary flex-1 px-2 whitespace-nowrap">
          <span>{options.cancelLabel ?? "Cancel"}</span>
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          className={`btn-primary flex-1 px-2 whitespace-nowrap ${danger ? "bg-red-600 hover:bg-red-700 text-white border-0" : ""}`}
        >
          <span>{options.confirmLabel ?? "Confirm"}</span>
        </button>
      </div>
    </div>
  );
}

/** Mount once at the app root. Renders the oldest pending dialog. */
export function AppDialogHost() {
  const requests = useSyncExternalStore(subscribe, snapshot, snapshot);
  const current = requests[0];

  if (!current) return null;
  const cancelCurrent = () => {
    dismiss(current.id);
    if (current.kind === "confirm") current.resolve(false);
  };
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" key={current.id}>
      <div
        className="absolute inset-0 bg-black/45 modal-backdrop-enter"
        style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        aria-hidden="true"
        onClick={cancelCurrent}
      />
      {current.kind === "error" ? <ErrorDialog request={current} /> : <ConfirmDialog request={current} />}
    </div>,
    document.body,
  );
}
