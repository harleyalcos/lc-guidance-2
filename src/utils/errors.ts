/**
 * Shared helpers that turn raw failures (Rust `Err(String)`, SQLite messages,
 * fetch/network errors, JS exceptions) into human-readable explanations for the
 * in-app error dialog, while keeping the original text as technical details.
 */

export interface FriendlyError {
  title: string;
  message: string;
  /** Plain-language cause, when known. */
  reason?: string;
  guidance?: string;
  details?: string;
}

export interface ErrorContext {
  /** Short heading such as "Couldn't save the case". */
  title: string;
  /** Explanation used when the raw error is too technical to show directly. */
  message?: string;
  /** Next step for the counselor (Retry, check settings, etc.). */
  guidance?: string;
}

/** Extract the most useful text from anything thrown or rejected. */
export function errorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name || String(error);
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error", "reason", "details"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * True when the failure represents the user intentionally backing out (closing a
 * native file dialog, aborting a request) rather than a real error.
 */
export function isUserCancellation(error: unknown): boolean {
  if (error == null) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  const text = errorText(error).toLowerCase();
  return /^(user )?cancel(l)?ed\b|dialog (was )?(closed|cancel(l)?ed)|operation (was )?cancel(l)?ed by (the )?user/.test(text.trim());
}

interface Pattern {
  test: RegExp;
  message: string;
  guidance: string;
  /** When true, this guidance replaces the caller's (the cause dictates the fix). */
  overrides?: boolean;
}

const KNOWN_PATTERNS: Pattern[] = [
  {
    test: /please sign in to continue|not authenticated|session (has )?expired/i,
    message: "Your session has ended, so the request was not completed.",
    guidance: "Sign out, sign back in with your PIN, and try again.",
    overrides: true,
  },
  {
    test: /database is (locked|busy)|sqlite_busy|database table is locked|the database is busy/i,
    message: "The database is busy finishing another operation.",
    guidance: "Wait a few seconds and try again. Close any other copy of the app that may be open.",
    overrides: true,
  },
  {
    test: /unique constraint failed/i,
    message: "A record with the same details already exists.",
    guidance: "Check for an existing record before saving again.",
  },
  {
    test: /(foreign key|not null|check) constraint failed/i,
    message: "The record is missing required information or refers to data that no longer exists.",
    guidance: "Reload the page, review the required fields, and try again.",
  },
  {
    test: /database disk image is malformed|file is not a database|sqlite_corrupt|file is encrypted or is not a database/i,
    message: "The database file appears to be damaged or is not a valid database.",
    guidance: "Restore a recent backup from Settings → Backup, or contact school IT support.",
    overrides: true,
  },
  {
    test: /disk (i\/o error|is full)|no space left|os error 28|os error 112/i,
    message: "The computer ran out of disk space or could not write to the disk.",
    guidance: "Free up disk space and try again.",
  },
  {
    test: /permission denied|access is denied|os error 13|os error 5\b|operation not permitted|os error 1\b/i,
    message: "The app does not have permission to read or write that location.",
    guidance: "Choose a different folder (for example Documents or Downloads), or close the file if it is open in another program.",
  },
  {
    test: /os error 32|being used by another process|resource busy|text file busy/i,
    message: "The file is open in another program.",
    guidance: "Close the file in Excel or any other program, then try again.",
  },
  {
    test: /no such file or directory|cannot find the (file|path) specified|os error 2\b|os error 3\b|enoent/i,
    message: "The file or folder could not be found.",
    guidance: "Make sure the file still exists and has not been moved, then try again.",
  },
  {
    test: /failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected|err_network|\boffline\b|\bdns\b|could not resolve|connection (refused|reset|timed out)|timed? ?out/i,
    message: "The app could not reach the internet service.",
    guidance: "Check the computer's internet connection and try again.",
  },
];

/** Heuristic: does this raw text read like a sentence written for people? */
function isHumanReadable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 280) return false;
  if (/\n\s+at\s|panicked at|stack backtrace|rusqlite|sqlite_|\bos error\b|errno|::|\{\s*"|undefined is not|cannot read propert|is not a function|typeerror|referenceerror|syntaxerror|unexpected token|\bjson\b/i.test(trimmed)) {
    return false;
  }
  return /[a-z]/i.test(trimmed);
}

/** Ensure sentences end with punctuation for consistent dialog copy. */
function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?)]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/**
 * Build the content for the error dialog:
 * - `message` says what failed (the caller's explanation),
 * - `reason` says why, when the raw error can be explained in plain words
 *   (a known technical failure, or an already-friendly backend message),
 * - `details` keeps the raw text for IT support when it is technical.
 */
export function describeError(error: unknown, context: ErrorContext): FriendlyError {
  const raw = errorText(error).trim();
  const pattern = raw ? KNOWN_PATTERNS.find((candidate) => candidate.test.test(raw)) : undefined;
  const readable = !pattern && raw && isHumanReadable(raw) ? sentence(raw) : undefined;
  const reason = pattern?.message ?? readable;
  const guidance =
    (pattern?.overrides ? pattern.guidance : undefined) ??
    context.guidance ??
    pattern?.guidance ??
    "Try again. If the problem continues, contact school IT support and share the technical details below.";

  let message = context.message ?? reason ?? "Something went wrong while completing this action.";
  let shownReason = context.message ? reason : undefined;
  if (shownReason) {
    // Drop sentences the message already says (e.g. "Your current data has not changed.").
    const said = message.toLowerCase();
    shownReason = (shownReason.match(/[^.!?]+[.!?]*/g) ?? [shownReason])
      .map((part) => part.trim())
      .filter((part) => part && !said.includes(part.toLowerCase().replace(/[.!?]+$/, "")))
      .join(" ") || undefined;
  }
  if (!context.message && !reason) message = "Something went wrong while completing this action.";

  return {
    title: context.title,
    message,
    reason: shownReason,
    guidance,
    details: raw && !readable ? raw : undefined,
  };
}

/** One-line explanation for inline (non-dialog) error states. */
export function explainError(error: unknown, fallback: string): string {
  const friendly = describeError(error, { title: "", message: fallback });
  return friendly.reason ? `${friendly.message} ${friendly.reason}` : friendly.message;
}

/** Make a value safe to use as part of a filename on Windows, macOS and Linux. */
export function safeFilename(value: string, fallback = "document"): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  return cleaned || fallback;
}
