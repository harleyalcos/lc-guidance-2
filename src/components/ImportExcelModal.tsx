import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import ImportErrorModal from "./ImportErrorModal";

export interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void; // Keeping it for backward compatibility if needed, though we navigate away.
}

const MODAL_EXIT_MS = 200;

export default function ImportExcelModal({ isOpen, onClose }: ImportExcelModalProps) {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();

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

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setIsToastVisible(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    window.requestAnimationFrame(() => setIsToastVisible(true));
    toastTimerRef.current = window.setTimeout(() => {
      setIsToastVisible(false);
      window.setTimeout(() => setToast(null), 1000);
    }, 2800);
  };

  const closeWithAnimation = (afterClose?: () => void) => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
      afterClose?.();
    }, MODAL_EXIT_MS);
  };

  if (!isVisible) return null;

  const handleDownloadTemplate = async () => {
    try {
      setIsLoading(true);
      await invoke<string>("generate_import_template");
      showToast("success", "Template saved to your Downloads folder!");
    } catch (e) {
      showToast("error", `Failed to generate template: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Excel", extensions: ["xlsx"] }]
      });

      if (!selected) return;

      const filePaths: string[] = Array.isArray(selected) ? selected : [selected];
      if (filePaths.length === 0) return;

      setIsLoading(true);

      const allNewRows: any[] = [];
      const newFilenames: string[] = [];

      for (const filePath of filePaths) {
        const fname = filePath.replace(/^.*[\\\/]/, '');
        newFilenames.push(fname);
        const result = await invoke<any>("parse_import_file", { filePath });
        if (result && Array.isArray(result.rows)) {
          allNewRows.push(...result.rows);
        }
      }

      let combinedRows = allNewRows;
      let combinedFilename = newFilenames.join(", ");

      try {
        const storedRowsStr = localStorage.getItem("lc_pending_import_rows");
        const storedFilenameStr = localStorage.getItem("lc_pending_import_filename");
        if (storedRowsStr) {
          const storedRows = JSON.parse(storedRowsStr);
          if (Array.isArray(storedRows) && storedRows.length > 0) {
            combinedRows = [...storedRows, ...allNewRows];
            if (storedFilenameStr) {
              const existingNames = storedFilenameStr.split(", ").map((s: string) => s.trim()).filter(Boolean);
              const addedNames = newFilenames.filter((f) => !existingNames.includes(f));
              combinedFilename = [...existingNames, ...addedNames].join(", ");
            }
          }
        }
      } catch (e) {
        console.error("Error reading existing pending imports:", e);
      }

      closeWithAnimation(() => {
        navigate("/import-review", {
          state: {
            parseResult: {
              rows: combinedRows,
              valid_count: combinedRows.filter((r: any) => !r.has_errors && !r.is_duplicate).length,
              duplicate_count: combinedRows.filter((r: any) => r.is_duplicate && !r.has_errors).length,
              error_count: combinedRows.filter((r: any) => r.has_errors).length,
            },
            filename: combinedFilename,
          },
        });
      });
    } catch (e) {
      setParseError(String(e));
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <>
      {parseError && (
        <ImportErrorModal
          isOpen={!!parseError}
          onClose={() => setParseError(null)}
          rawError={parseError}
          onSelectAnotherFile={handleSelectFile}
          onDownloadTemplate={handleDownloadTemplate}
        />
      )}

      {toast && (
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl px-4 py-3 shadow-xl transition-[transform,opacity] duration-1000 ease-out ${
          toast.type === "success"
            ? "border border-primary/30 bg-[#EEF2FC] dark:bg-[#1A233D] text-[#002F87] dark:text-[#b4c5ff]"
            : "border border-error/30 bg-error-container text-on-error-container"
        } ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className={`material-symbols-outlined ${toast.type === "success" ? "text-primary dark:text-[#b4c5ff]" : "text-error"}`} style={{ fontSize: 18 }}>
            {toast.type === "success" ? "info" : "error"}
          </span>
          <p className="text-xs font-bold">{toast.message}</p>
        </div>
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${
            isClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
          }`}
          onClick={() => closeWithAnimation()}
        />
        <div 
          className={`relative z-10 bg-surface border border-outline-variant rounded-3xl w-full max-w-lg shadow-xl flex flex-col overflow-hidden ${
            isClosing ? "modal-panel-exit" : "modal-panel-enter"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant bg-surface-container-low">
            <h2 className="text-xl font-semibold text-on-surface">Import Cases</h2>
            <button 
              onClick={() => closeWithAnimation()}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          
          <div className="p-6">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-on-surface-variant">
                Import cases using the exact database export Excel (.xlsx) format. Below is how the sheet should look like for seamless importing:
              </p>

              {/* Table Preview */}
              <div className="flex flex-col">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-1.5">Sheet Structure Preview</p>
                <div className="overflow-x-auto border border-outline-variant rounded-xl bg-surface-container-low max-w-full">
                  <table className="min-w-full divide-y divide-outline-variant text-[11px] font-mono border-collapse">
                    <thead className="bg-surface-container">
                      <tr className="divide-x divide-outline-variant">
                        {["Full Name", "Date", "Case", "Sanction", "Progress", "Section", "Adviser"].map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-bold text-secondary whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-surface divide-x divide-outline-variant border-t border-outline-variant">
                        <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">Smith, Jane A.</td>
                        <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">06/21/2026</td>
                        <td className="px-3 py-2 text-on-surface-variant">Truancy</td>
                        <td className="px-3 py-2 text-on-surface-variant">Suspension</td>
                        <td className="px-3 py-2 text-on-surface-variant">Resolved</td>
                        <td className="px-3 py-2 text-on-surface-variant">STEM</td>
                        <td className="px-3 py-2 text-on-surface-variant last:border-r-0">Mrs. Cruz</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tip alert box */}
              <div className="bg-[#EEEDFE] dark:bg-[#1E1B4B]/50 border border-[#CECBF6]/60 dark:border-[#4338CA]/40 p-3.5 rounded-xl flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#534AB7] dark:text-[#818CF8] shrink-0" style={{ fontSize: 18 }}>lightbulb</span>
                <p className="text-xs text-[#3C3489] dark:text-[#C7D2FE] font-medium leading-relaxed">
                  <strong>TIP:</strong> You can easily download an empty, pre-configured file with all these headers set up by clicking the <strong>Download Template</strong> button below!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleSelectFile}
                  disabled={isLoading}
                  className="btn-primary flex-1"
                >
                  <span className="material-symbols-outlined text-[20px]">{isLoading ? "hourglass_empty" : "upload_file"}</span>
                  <span>{isLoading ? "Parsing File..." : "Select File"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={isLoading}
                  className="btn-secondary flex-1"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  <span>Download Template</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
