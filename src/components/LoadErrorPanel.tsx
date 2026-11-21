import { describeError } from "../utils/errors";

interface LoadErrorPanelProps {
  title: string;
  error: unknown;
  onRetry: () => void;
  /** Optional extra note, e.g. "No report should be issued until records load." */
  note?: string;
}

/** In-page error state for screens whose data failed to load, with a working Retry. */
export default function LoadErrorPanel({ title, error, onRetry, note }: LoadErrorPanelProps) {
  const friendly = describeError(error, {
    title,
    message: "The records could not be read from the database.",
    guidance: "Click Try Again. If it keeps failing, restart the app.",
  });
  return (
    <div role="alert" className="p-6 rounded-xl border border-error/30 bg-error-container text-on-error-container flex flex-col gap-3 max-w-2xl">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-error" aria-hidden="true">error</span>
        <h1 className="text-lg font-bold">{friendly.title}</h1>
      </div>
      <p className="text-sm">{friendly.message}</p>
      {friendly.reason && <p className="text-sm">{friendly.reason}</p>}
      {friendly.guidance && <p className="text-sm opacity-90">{friendly.guidance}</p>}
      {note && <p className="text-sm font-semibold">{note}</p>}
      {friendly.details && (
        <details className="rounded-lg border border-error/20 bg-surface/60">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold">Technical details</summary>
          <pre className="px-3 pb-3 text-[11px] font-mono whitespace-pre-wrap break-all">{friendly.details}</pre>
        </details>
      )}
      <div>
        <button type="button" className="btn-primary" onClick={onRetry}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span>
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
}
