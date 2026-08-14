import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

interface UpdateContextType {
  currentVersion: string;
  hasUpdate: boolean;
  updateInfo: Update | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  isDownloaded: boolean;
  isModalOpen: boolean;
  isBannerDismissed: boolean;
  lastChecked: Date | null;
  errorMessage: string | null;
  setIsModalOpen: (open: boolean) => void;
  dismissBanner: () => void;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  relaunchApp: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextType | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState<string>("0.1.0");
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getVersion()
      .then(setCurrentVersion)
      .catch((err) => console.warn("[Updater] Failed to get app version:", err));
  }, []);

  const checkForUpdates = useCallback(async (manual = false) => {
    try {
      setIsChecking(true);
      setErrorMessage(null);
      const update = await check();
      setLastChecked(new Date());

      if (update?.available) {
        setUpdateInfo(update);
        setIsBannerDismissed(false);
        if (manual) {
          setIsModalOpen(true);
        }
      } else {
        setUpdateInfo(null);
        if (manual) {
          setIsModalOpen(true);
        }
      }
    } catch (err) {
      console.warn("[Updater] Check error:", err);
      if (manual) {
        let msg = "Could not reach update server. Check internet connection.";
        if (err instanceof Error && err.message) {
          msg = err.message;
        } else if (typeof err === "string" && err.trim().length > 0) {
          msg = err;
        }

        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          msg = "No update manifest found on the update server (HTTP 404).";
        }
        setErrorMessage(msg);
        setIsModalOpen(true);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Check quietly once on application startup
  useEffect(() => {
    checkForUpdates(false);
  }, [checkForUpdates]);

  const downloadAndInstall = async () => {
    if (!updateInfo) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    setErrorMessage(null);

    let downloaded = 0;
    let contentLength = 0;

    try {
      await updateInfo.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            setDownloadProgress(Math.min(100, Math.round((downloaded / contentLength) * 100)));
          }
        } else if (event.event === "Finished") {
          setDownloadProgress(100);
        }
      });

      setIsDownloading(false);
      setIsDownloaded(true);
    } catch (err) {
      console.error("[Updater] Install failed:", err);
      setIsDownloading(false);
      setErrorMessage(err instanceof Error ? err.message : "Failed to download update.");
    }
  };

  const relaunchApp = async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("[Updater] Relaunch failed:", err);
    }
  };

  const dismissBanner = () => {
    setIsBannerDismissed(true);
  };

  return (
    <UpdateContext.Provider
      value={{
        currentVersion,
        hasUpdate: !!updateInfo?.available,
        updateInfo,
        isChecking,
        isDownloading,
        downloadProgress,
        isDownloaded,
        isModalOpen,
        isBannerDismissed,
        lastChecked,
        errorMessage,
        setIsModalOpen,
        dismissBanner,
        checkForUpdates,
        downloadAndInstall,
        relaunchApp,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export const useAppUpdate = () => {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error("useAppUpdate must be used within an UpdateProvider");
  }
  return context;
};
