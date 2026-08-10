import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ImportErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawError: string;
  onSelectAnotherFile?: () => void;
  onDownloadTemplate?: () => void;
}

interface ParsedErrorItem {
  columnNum?: string;
  expected?: string;
  found?: string;
  raw: string;
  type: "mismatch" | "missing" | "extra" | "other";
}

const MODAL_EXIT_MS = 200;

export default function ImportErrorModal({
  isOpen,
  onClose,
  rawError,
  onSelectAnotherFile,
  onDownloadTemplate,
}: ImportErrorModalProps) {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
      return;
    }

    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
    }, MODAL_EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
    }, MODAL_EXIT_MS);
  };

  if (!isVisible) return null;

  // Parse raw error string into formatted error structure
  const parseError = (raw: string) => {
    const cleaned = raw
      .replace(/^Failed to parse file:\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim();

    const lines = cleaned
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const isHeaderMismatch =
      cleaned.toLowerCase().includes("invalid import format") ||
      lines.some(
        (l) =>
          l.toLowerCase().includes("column") ||
          l.toLowerCase().includes("missing expected column")
      );

    let title = "Import File Error";
    let summary =
      "The uploaded file could not be processed. Please check the file structure and try again.";
    const columnErrors: ParsedErrorItem[] = [];
    const generalErrors: string[] = [];

    if (isHeaderMismatch) {
      title = "Invalid Excel Header Format";
      summary =
        "The column headers in your uploaded file do not match the required layout. Fix the issues below or download the template.";

      for (const line of lines) {
        if (line.toLowerCase().includes("invalid import format")) continue;

        // Match: Column 1 should be 'Full Name' but got 'Name'
        const matchMismatch = line.match(
          /^Column\s+(\d+)\s+should be\s+'([^']+)'\s+but got\s+'([^']*)'/i
        );
        if (matchMismatch) {
          columnErrors.push({
            columnNum: matchMismatch[1],
            expected: matchMismatch[2],
            found: matchMismatch[3],
            raw: line,
            type: "mismatch",
          });
          continue;
        }

        // Match: Missing expected column 'Date' at position 2
        const matchMissing = line.match(
          /^Missing expected column\s+'([^']+)'\s+at position\s+(\d+)/i
        );
        if (matchMissing) {
          columnErrors.push({
            columnNum: matchMissing[2],
            expected: matchMissing[1],
            raw: line,
            type: "missing",
          });
          continue;
        }

        // Match: Found N extra columns
        const matchExtra = line.match(/^Found\s+(\d+)\s+extra columns/i);
        if (matchExtra) {
          columnErrors.push({
            raw: line,
            type: "extra",
          });
          continue;
        }

        columnErrors.push({
          raw: line,
          type: "other",
        });
      }
    } else {
      if (cleaned.toLowerCase().includes("too large")) {
        title = "File Exceeds Allowed Size";
        summary =
          "The file contains too many rows for a single import batch.";
      } else if (
        cleaned.toLowerCase().includes("invalid or corrupted") ||
        cleaned.toLowerCase().includes("excel spreadsheet")
      ) {
        title = "Invalid or Corrupted File";
        summary =
          "The file could not be opened as a valid Excel (.xlsx) spreadsheet.";
      } else if (cleaned.toLowerCase().includes("does not contain any sheets")) {
        title = "Empty Excel File";
        summary = "The uploaded file does not contain any readable worksheets.";
      }

      generalErrors.push(...lines);
    }

    return { title, summary, columnErrors, generalErrors, isHeaderMismatch };
  };

  const parsed = parseError(rawError);

  const EXPECTED_HEADERS = [
    "Full Name",
    "Date",
    "Case",
    "Sanction",
    "Progress",
    "Grade Level",
    "Section",
    "Adviser",
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
          isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
        }`}
        onClick={handleClose}
      />

      {/* Modal Container */}
      <div
        className={`relative z-10 bg-surface border border-outline-variant rounded-3xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isClosing ? "modal-panel-exit" : "modal-panel-enter"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-error-container text-error flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[22px]">warning</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface leading-snug">
                {parsed.title}
              </h2>
              <p className="text-xs text-secondary mt-0.5 leading-relaxed max-w-md">
                {parsed.summary}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors shrink-0 -mr-1 -mt-1"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {parsed.isHeaderMismatch && parsed.columnErrors.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                  Header Errors ({parsed.columnErrors.length})
                </span>
                <span className="text-xs text-error font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  Action required in file
                </span>
              </div>

              <div className="space-y-2.5">
                {parsed.columnErrors.map((err, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-surface-container-low border border-outline-variant rounded-2xl flex items-start gap-3 shadow-xs"
                  >
                    {err.type === "mismatch" ? (
                      <>
                        <div className="w-6 h-6 rounded-lg bg-error/10 text-error flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </div>
                        <div className="flex-1 text-xs min-w-0">
                          <div className="flex items-center justify-between font-bold text-on-surface mb-1.5">
                            <span>Column #{err.columnNum} Name Mismatch</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-mono font-semibold uppercase tracking-wider">
                              Mismatch
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[11px]">
                            <div className="bg-surface p-2.5 rounded-xl border border-outline-variant">
                              <span className="text-[9px] uppercase tracking-wider text-secondary font-sans block mb-1 font-bold">
                                Expected Header
                              </span>
                              <span className="text-primary font-semibold block truncate">
                                {err.expected}
                              </span>
                            </div>
                            <div className="bg-error-container/30 p-2.5 rounded-xl border border-error/20">
                              <span className="text-[9px] uppercase tracking-wider text-error font-sans block mb-1 font-bold">
                                Found in File
                              </span>
                              <span className="text-error font-semibold block truncate">
                                {err.found ? `"${err.found}"` : "(empty)"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : err.type === "missing" ? (
                      <>
                        <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[16px]">remove</span>
                        </div>
                        <div className="flex-1 text-xs min-w-0">
                          <div className="flex items-center justify-between font-bold text-on-surface mb-1">
                            <span>Missing Column at Position #{err.columnNum}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono font-semibold uppercase tracking-wider">
                              Missing
                            </span>
                          </div>
                          <p className="text-secondary text-[11px]">
                            The file is missing column header{" "}
                            <code className="px-1.5 py-0.5 bg-surface border border-outline-variant rounded-md font-mono text-primary font-bold">
                              {err.expected}
                            </code>
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-6 h-6 rounded-lg bg-surface-variant text-secondary flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[16px]">info</span>
                        </div>
                        <p className="text-xs text-on-surface font-medium leading-relaxed flex-1">
                          {err.raw}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-error-container/20 border border-error/30 rounded-2xl space-y-2.5">
              {parsed.generalErrors.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-on-surface font-mono">
                  <span className="material-symbols-outlined text-error text-[16px] mt-0.5 shrink-0">
                    error
                  </span>
                  <span className="leading-relaxed">{line}</span>
                </div>
              ))}
            </div>
          )}

          {/* Correct Column Reference Guide */}
          <div className="p-4 bg-surface-container-low border border-outline-variant rounded-2xl space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">table_chart</span>
              <span className="text-xs font-bold text-on-surface">Required Excel Column Order</span>
            </div>
            <p className="text-[11px] text-secondary">
              Your Excel file headers must match this exact sequence (case-sensitive):
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXPECTED_HEADERS.map((hdr, i) => (
                <span
                  key={hdr}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-outline-variant rounded-lg text-[11px] font-mono text-on-surface shadow-2xs"
                >
                  <span className="text-[10px] text-secondary font-bold font-sans">#{i + 1}</span>
                  <span className="font-semibold text-primary">{hdr}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-outline-variant bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onDownloadTemplate && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onDownloadTemplate();
                }}
                className="btn-secondary text-xs h-9 px-3.5 w-full sm:w-auto justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>Download Template</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onSelectAnotherFile && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onSelectAnotherFile();
                }}
                className="btn-primary text-xs h-9 px-4 w-full sm:w-auto justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                <span>Select Another File</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary text-xs h-9 px-4 w-full sm:w-auto justify-center"
            >
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
