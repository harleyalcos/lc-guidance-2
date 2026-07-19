import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";

interface BackupRecord {
  date_time: string;
  backup_type: string;
  file_size: string;
  filename: string;
}

const MODAL_EXIT_MS = 200;

export default function Backup() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Operation states
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  const [confirmRestoreFilename, setConfirmRestoreFilename] = useState<string | null>(null);
  const [isRestoreConfirmClosing, setIsRestoreConfirmClosing] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isNotificationVisible, setIsNotificationVisible] = useState(false);
  const notificationTimerRef = useRef<number | null>(null);

  // Settings states from localStorage
  const [autoBackup, setAutoBackup] = useState(() => {
    const saved = localStorage.getItem("backup_settings_auto");
    return saved !== "false"; // default to true
  });
  const [frequency, setFrequency] = useState(() => {
    return localStorage.getItem("backup_settings_freq") || "Daily";
  });
  const [retention, setRetention] = useState(() => {
    return localStorage.getItem("backup_settings_retention") || "7";
  });

  // Load backups list
  const loadBackups = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await invoke<BackupRecord[]>("get_backups");
      setBackups(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  // Persist settings
  const handleToggleAuto = () => {
    const newValue = !autoBackup;
    setAutoBackup(newValue);
    localStorage.setItem("backup_settings_auto", String(newValue));
    showNotification(`Automatic backups ${newValue ? "enabled" : "disabled"}`, "success");
  };

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setFrequency(val);
    localStorage.setItem("backup_settings_freq", val);
    showNotification(`Backup frequency updated to ${val}`, "success");
  };

  const handleRetentionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRetention(val);
    localStorage.setItem("backup_settings_retention", val);
  };

  // Notification helper
  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setIsNotificationVisible(false);
    if (notificationTimerRef.current) window.clearTimeout(notificationTimerRef.current);
    window.requestAnimationFrame(() => setIsNotificationVisible(true));
    notificationTimerRef.current = window.setTimeout(() => {
      setIsNotificationVisible(false);
      window.setTimeout(() => setNotification(null), 1000);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) window.clearTimeout(notificationTimerRef.current);
    };
  }, []);

  // Run manual backup
  const handleBackupNow = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      await invoke("create_backup");
      showNotification("Manual backup created successfully!", "success");
      loadBackups();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setIsBackingUp(false);
    }
  };

  // Restore backup
  const closeRestoreConfirm = (afterClose?: () => void) => {
    setIsRestoreConfirmClosing(true);
    window.setTimeout(() => {
      setConfirmRestoreFilename(null);
      setIsRestoreConfirmClosing(false);
      afterClose?.();
    }, MODAL_EXIT_MS);
  };

  const handleRestore = async (filename: string) => {
    setConfirmRestoreFilename(null);
    setRestoringFilename(filename);
    try {
      await invoke("restore_backup", { filename });
      showNotification("Database restored successfully!", "success");
      loadBackups();
      // Dispatch event so layout / catalog updates cases automatically
      window.dispatchEvent(new Event("cases:changed"));
      
      // Reload window after short delay to fully refresh application state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRestoringFilename(null);
    }
  };

  // Get date of the last backup
  const getLastBackupText = () => {
    if (backups.length === 0) return "No backups created yet";
    const latest = backups[0];
    // Simple format: e.g. "Today, 8:03 AM"
    return `Last backup: ${latest.date_time}`;
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in relative pb-12">
      {/* Toast Notification */}
      {notification && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl px-4 py-3 shadow-xl text-xs font-bold ${
          notification.type === "success"
            ? "border border-green-500/30 bg-green-50 text-green-900"
            : "border border-error/30 bg-error-container text-on-error-container"
        } ${isNotificationVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className={`material-symbols-outlined ${notification.type === "success" ? "text-green-600" : "text-error"}`} style={{ fontSize: 18 }}>
            {notification.type === "success" ? "check_circle" : "error"}
          </span>
          <p className="text-xs font-bold">{notification.message}</p>
        </div>,
        document.body
      )}

      {/* Top Status Card */}
      <div className="bg-surface dark:bg-surface-container border border-outline-variant rounded-xl p-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary dark:text-[#7f9cf8] shrink-0">
            <span className="material-symbols-outlined text-2xl font-bold">check_circle</span>
          </div>
          <div>
            <h3 className="font-bold text-on-surface text-base leading-snug">
              {getLastBackupText()}
            </h3>
            <p className="text-secondary dark:text-secondary-fixed-dim text-xs font-medium mt-0.5">
              Automatic backups are running normally
            </p>
          </div>
        </div>
        <div>
          <button
            onClick={handleBackupNow}
            disabled={isBackingUp}
            className="group bg-[#0B1E43] dark:bg-primary hover:bg-[#001c59] dark:hover:bg-opacity-95 text-white font-bold py-2.5 px-5 rounded-lg flex items-center gap-2 transition-all duration-500 shadow-sm text-xs disabled:opacity-60 active:scale-95 animate-none"
          >
            <span 
              className={`material-symbols-outlined text-[16px] transition-[font-variation-settings] duration-500 ${
                isBackingUp ? "animate-spin" : "group-hover:[font-variation-settings:'FILL'_1]"
              }`}
              style={{
                fontVariationSettings: isBackingUp ? undefined : "'FILL' 0"
              }}
            >
              {isBackingUp ? "sync" : "backup"}
            </span>
            <span>{isBackingUp ? "Backing up..." : "Backup Now"}</span>
          </button>
        </div>
      </div>

      {/* Backup History Card */}
      <div className="bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-surface-container-low dark:bg-surface-container-high/40">
          <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base">
            Backup History
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low dark:bg-surface-container-low border-b border-outline-variant text-secondary dark:text-on-surface-variant font-section-header text-xs uppercase tracking-wider">
                <th className="px-6 py-3.5 font-semibold">Date & Time</th>
                <th className="px-6 py-3.5 font-semibold">Type</th>
                <th className="px-6 py-3.5 font-semibold">File Size</th>
                <th className="px-6 py-3.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-sm text-on-surface">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-secondary">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
                      <span className="text-xs font-bold">Loading backup history...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-[#ba1a1a]">
                    <span className="material-symbols-outlined text-3xl">error</span>
                    <p className="text-xs font-bold mt-1">Failed to load backups: {error}</p>
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-secondary">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="material-symbols-outlined text-4xl text-outline-variant">backup</span>
                      <span className="text-xs font-bold">No backups found</span>
                      <span className="text-[10px] opacity-75">Click "Backup Now" to create your first database backup.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.filename} className="border-b border-outline-variant/40 hover:bg-surface-container-low/50 dark:hover:bg-surface-container-high/20 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <span className="px-2.5 py-1 bg-surface-container border border-outline-variant rounded font-data-mono text-xs inline-block">
                        {backup.date_time}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] tracking-wider uppercase border inline-block ${
                        backup.backup_type === "Manual"
                          ? "bg-blue-50 dark:bg-blue-950/20 text-[#0B1E43] dark:text-[#7f9cf8] border-blue-200 dark:border-blue-900/30"
                          : "bg-surface-container text-secondary border-outline-variant"
                      }`}>
                        {backup.backup_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-secondary">{backup.file_size}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setIsRestoreConfirmClosing(false);
                          setConfirmRestoreFilename(backup.filename);
                        }}
                        disabled={restoringFilename !== null || isBackingUp}
                        className="border border-[#0B1E43] dark:border-[#7f9cf8] text-[#0B1E43] dark:text-[#7f9cf8] hover:bg-[#0B1E43]/5 dark:hover:bg-[#7f9cf8]/10 font-bold py-1 px-4 rounded transition-all duration-500 text-xs active:scale-95 disabled:opacity-50"
                      >
                        {restoringFilename === backup.filename ? "Restoring..." : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup Settings Card */}
      <div className="bg-surface dark:bg-surface-container border border-outline-variant rounded-xl shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-outline-variant flex items-center gap-2 bg-surface-container-low dark:bg-surface-container-high/40">
          <span className="material-symbols-outlined text-[#002F87] dark:text-[#7f9cf8]" style={{ fontSize: '20px' }}>settings</span>
          <h3 className="font-section-header text-[#002F87] dark:text-[#7f9cf8] font-bold text-base uppercase tracking-wider">
            Backup Settings
          </h3>
        </div>

        <div className="p-6 space-y-6">
          {/* Toggle Block */}
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-bold text-on-surface text-sm">Automatic Backups</h4>
              <p className="text-secondary text-xs mt-0.5">Run backups silently in the background.</p>
            </div>
            <div>
              <button
                onClick={handleToggleAuto}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-500 ease-in-out focus:outline-none ${
                  autoBackup ? "bg-primary" : "bg-[#c4c6d4]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-500 ease-in-out ${
                    autoBackup ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="h-[2px] bg-outline-variant" />

          {/* Side-by-side Frequency and Retention Policy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Frequency Block */}
            <div className="flex flex-col gap-2">
              <label className="font-bold text-on-surface text-xs">Frequency</label>
              <div className="relative w-full">
                <select
                  value={frequency}
                  onChange={handleFrequencyChange}
                  className="w-full appearance-none bg-surface dark:bg-surface-container border border-outline-variant rounded-lg pl-3 pr-10 py-2 font-body-md text-sm text-on-surface cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="On New Record">On New Record</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-secondary">
                  <span className="material-symbols-outlined text-sm">expand_more</span>
                </div>
              </div>
            </div>

            {/* Retention Block */}
            <div className="flex flex-col gap-2">
              <label className="font-bold text-on-surface text-xs">Retention Policy</label>
              <div className="flex items-center gap-3 h-full">
                <span className="text-secondary text-sm">Keep last</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={retention}
                  onChange={handleRetentionChange}
                  className="w-16 bg-surface dark:bg-surface-container border border-outline-variant rounded-lg px-2.5 py-1.5 text-center text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <span className="text-secondary text-sm font-medium">backups</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Dialog Modal */}
      {confirmRestoreFilename && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
              isRestoreConfirmClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
            }`}
            onClick={() => closeRestoreConfirm()}
          />
          <div className={`bg-surface dark:bg-surface-container border border-outline-variant max-w-md w-full rounded-2xl p-6 shadow-2xl flex flex-col gap-4 text-center z-10 ${
            isRestoreConfirmClosing ? "modal-panel-exit" : "modal-panel-enter"
          }`}>
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/20 text-[#ba1a1a] flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl font-bold">warning</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-on-surface">Confirm Restore</h3>
              <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                WARNING: Restoring will overwrite the current database with the backup file{" "}
                <strong className="text-on-surface font-semibold">{confirmRestoreFilename}</strong>. 
                Any changes made after this backup date will be lost. Do you want to proceed?
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => closeRestoreConfirm()}
                className="flex-1 py-2 border border-outline-variant text-on-surface font-bold text-xs rounded-lg hover:bg-surface-container transition-all duration-500"
              >
                Cancel
              </button>
              <button
                onClick={() => closeRestoreConfirm(() => handleRestore(confirmRestoreFilename))}
                className="flex-1 py-2 bg-red-600 text-white font-bold text-xs rounded-lg hover:bg-red-700 transition-all duration-500 shadow-sm"
              >
                Proceed & Restore
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
