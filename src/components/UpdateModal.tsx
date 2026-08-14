import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppUpdate } from "../context/UpdateContext";

export default function UpdateModal() {
  const {
    isModalOpen,
    setIsModalOpen,
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    isDownloaded,
    errorMessage,
    checkForUpdates,
    downloadAndInstall,
    relaunchApp,
  } = useAppUpdate();

  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isModalOpen) {
      setIsClosing(false);
    }
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  const handleClose = () => {
    if (isDownloading) return; // Prevent closing while actively downloading
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
    }, 200);
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDownloading) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        className={`w-full max-w-lg bg-surface dark:bg-surface-container rounded-2xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-outline-variant bg-surface-container-low dark:bg-surface-container-high/40 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary dark:text-[#b4c5ff] flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">system_update</span>
            </div>
            <div>
              <h2 id="update-modal-title" className="text-base font-bold text-on-surface">
                {isDownloaded
                  ? "Update Ready to Install"
                  : updateInfo
                  ? `Software Update v${updateInfo.version}`
                  : isChecking
                  ? "Checking for Updates..."
                  : "Software Updates"}
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                {updateInfo
                  ? `Published on ${updateInfo.date ? new Date(updateInfo.date).toLocaleDateString() : "recently"}`
                  : "Laguna College Guidance Office System"}
              </p>
            </div>
          </div>

          {!isDownloading && (
            <button
              onClick={handleClose}
              className="text-secondary hover:text-on-surface p-1.5 rounded-lg transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {isChecking ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-secondary">
              <span className="material-symbols-outlined text-3xl text-primary animate-spin">
                progress_activity
              </span>
              <p className="text-sm font-semibold">Connecting to update server...</p>
            </div>
          ) : errorMessage ? (
            <div className="p-4 rounded-xl bg-error-container/40 border border-error/30 text-on-error-container flex items-start gap-3">
              <span className="material-symbols-outlined text-error text-[20px] mt-0.5">error</span>
              <div className="text-xs">
                <p className="font-bold">Update Check Failed</p>
                <p className="mt-1 text-secondary">{errorMessage}</p>
              </div>
            </div>
          ) : updateInfo ? (
            <>
              {/* Release Notes */}
              <div>
                <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                  What's New in this Version
                </h3>
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/60 text-xs text-on-surface leading-relaxed max-h-48 overflow-y-auto prose dark:prose-invert prose-xs">
                  {updateInfo.body ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {updateInfo.body}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-secondary italic">This update includes bug fixes and performance improvements.</p>
                  )}
                </div>
              </div>

              {/* Data Safety Guarantee Notice */}
              <div className="p-3.5 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">
                  lock
                </span>
                <p className="text-[11px] text-on-surface leading-snug">
                  <strong>Data Safety:</strong> All your existing cases, student records, and settings are stored safely in your database and will remain intact after the update.
                </p>
              </div>

              {/* Download Progress */}
              {isDownloading && (
                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                      Downloading update package...
                    </span>
                    <span className="text-secondary">{downloadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {isDownloaded && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-2.5 text-emerald-800 dark:text-emerald-200">
                  <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px]">
                    check_circle
                  </span>
                  <p className="text-xs">
                    <strong>Update downloaded successfully!</strong> Click restart to apply the updates immediately.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-center">
              <span className="material-symbols-outlined text-4xl text-emerald-600 dark:text-emerald-400">
                check_circle
              </span>
              <p className="text-sm font-bold text-on-surface">You're running the latest version!</p>
              <p className="text-xs text-secondary">
                No new updates are available right now.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-outline-variant bg-surface-container-low dark:bg-surface-container-high/20 flex items-center justify-end gap-3">
          {errorMessage ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void checkForUpdates(true)}
                className="btn-primary"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Try Again</span>
              </button>
            </>
          ) : isDownloaded ? (
            <button
              type="button"
              onClick={() => void relaunchApp()}
              className="btn-primary w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              <span>Restart Application Now</span>
            </button>
          ) : updateInfo ? (
            <>
              {!isDownloading && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn-secondary"
                >
                  Remind Me Later
                </button>
              )}
              <button
                type="button"
                onClick={() => void downloadAndInstall()}
                disabled={isDownloading}
                className="btn-primary"
              >
                {isDownloading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    <span>Downloading ({downloadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>Install & Restart</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="btn-primary"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
