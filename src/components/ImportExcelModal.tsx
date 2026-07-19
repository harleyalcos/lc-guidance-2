import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

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
  const [toastMessage, setToastMessage] = useState("");
  const [isToastVisible, setIsToastVisible] = useState(false);
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

  const showToast = (message: string) => {
    setToastMessage(message);
    setIsToastVisible(false);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    window.requestAnimationFrame(() => setIsToastVisible(true));
    toastTimerRef.current = window.setTimeout(() => {
      setIsToastVisible(false);
      window.setTimeout(() => setToastMessage(""), 1000);
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
      showToast("Template saved to your Downloads folder!");
    } catch (e) {
      showToast(`Failed to generate template: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Excel", extensions: ["xlsx"] }]
      });

      if (selected === null) return;
      
      setIsLoading(true);
      // Wait, we need the filename from `selected`. `selected` is an absolute path.
      // We can extract filename by splitting by '/' or '\'.
      const filename = selected.replace(/^.*[\\\/]/, '');

      const result = await invoke<any>("parse_import_file", { filePath: selected });
      
      closeWithAnimation(() => {
        // Navigate to review page
        navigate("/import-review", { state: { parseResult: result, filename } });
      });

    } catch (e) {
      showToast(`Failed to parse file: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <>
      {toastMessage && (
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl border border-error/30 bg-error-container px-4 py-3 text-on-error-container shadow-xl ${isToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className="material-symbols-outlined text-error" style={{ fontSize: 18 }}>error</span>
          <p className="text-xs font-bold">{toastMessage}</p>
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
          className={`relative z-10 bg-surface rounded-3xl w-full max-w-lg shadow-xl flex flex-col overflow-hidden ${
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
                      <tr className="divide-x divide-outline-variant/60">
                        {["First Name", "Last Name", "Middle Name", "Grade Level", "Section", "Incident Date", "Date Filed", "Adviser", "Case Type", "Description", "Sanction", "Progress", "Proofs"].map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-bold text-secondary whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-surface divide-x divide-outline-variant/60 border-t border-outline-variant">
                        <td className="px-3 py-2 text-on-surface-variant">Jane</td>
                        <td className="px-3 py-2 text-on-surface-variant">Smith</td>
                        <td className="px-3 py-2 text-on-surface-variant">A</td>
                        <td className="px-3 py-2 text-on-surface-variant">Grade 11</td>
                        <td className="px-3 py-2 text-on-surface-variant">STEM</td>
                        <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">2026-06-21</td>
                        <td className="px-3 py-2 text-on-surface-variant whitespace-nowrap">2026-06-21</td>
                        <td className="px-3 py-2 text-on-surface-variant">Mrs. Cruz</td>
                        <td className="px-3 py-2 text-on-surface-variant">Truancy</td>
                        <td className="px-3 py-2 text-on-surface-variant">Skipped...</td>
                        <td className="px-3 py-2 text-on-surface-variant">Detention</td>
                        <td className="px-3 py-2 text-on-surface-variant">Resolved</td>
                        <td className="px-3 py-2 text-on-surface-variant last:border-r-0">[]</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tip alert box */}
              <div className="bg-[#EEEDFE] border border-[#CECBF6]/60 p-3.5 rounded-xl flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#534AB7] shrink-0" style={{ fontSize: 18 }}>lightbulb</span>
                <p className="text-xs text-[#3C3489] font-medium leading-relaxed">
                  <strong>TIP:</strong> You can easily download an empty, pre-configured file with all these headers set up by clicking the <strong>Download Template</strong> button below!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <button
                  onClick={handleSelectFile}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm animate-fade-in"
                >
                  <span className="material-symbols-outlined text-[20px]">{isLoading ? "hourglass_empty" : "upload_file"}</span>
                  {isLoading ? "Parsing File..." : "Select File"}
                </button>
                <button
                  onClick={handleDownloadTemplate}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface-container border border-outline-variant text-on-surface rounded-xl font-medium hover:bg-surface-variant transition-colors disabled:opacity-50 text-sm"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Download Template
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
