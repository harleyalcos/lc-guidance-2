import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateContextType {
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
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      }
    } catch (err) {
      console.warn("[Updater] Check error:", err);
      if (manual) {
        setErrorMessage(err instanceof Error ? err.message : "Could not reach update server. Check internet connection.");
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
