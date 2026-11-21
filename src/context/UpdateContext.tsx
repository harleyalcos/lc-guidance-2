import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { errorText } from "../utils/errors";

export type UpdateErrorKind = "check" | "install" | "relaunch";

function updaterMessage(err: unknown, kind: UpdateErrorKind): string {
  const raw = errorText(err);
  if (kind === "check" && (raw.includes("404") || raw.toLowerCase().includes("not found"))) {
    return "No update information was found on the update server. Try again later.";
  }
  const fallback = {
    check: "Could not reach the update server. Check the internet connection and try again.",
    install: "The update could not be downloaded or installed. Your current version is still installed and working.",
    relaunch: "The update was installed, but the app could not restart itself. Close and reopen the app to finish updating.",
  }[kind];
  const reason = errorText(err).trim();
  return reason ? `${fallback}\n\nReason: ${reason}` : fallback;
}

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
  errorKind: UpdateErrorKind | null;
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
  const [errorKind, setErrorKind] = useState<UpdateErrorKind | null>(null);

  useEffect(() => {
    getVersion()
      .then(setCurrentVersion)
      // The version label is informational; the default stays if it cannot be read.
      .catch((err) => console.warn("[Updater] Failed to get app version:", err));
  }, []);

  const checkForUpdates = useCallback(async (manual = false) => {
    try {
      setIsChecking(true);
      setErrorMessage(null);
      setErrorKind(null);
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
      // The automatic startup check stays quiet (offline computers are common);
      // a manual check always reports the failure in the update dialog.
      console.warn("[Updater] Check error:", err);
      if (manual) {
        setErrorKind("check");
        setErrorMessage(updaterMessage(err, "check"));
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
    setErrorKind(null);

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
      setIsDownloading(false);
      setErrorKind("install");
      setErrorMessage(updaterMessage(err, "install"));
      setIsModalOpen(true);
    }
  };

  const relaunchApp = async () => {
    try {
      setErrorMessage(null);
      setErrorKind(null);
      await relaunch();
    } catch (err) {
      setErrorKind("relaunch");
      setErrorMessage(updaterMessage(err, "relaunch"));
      setIsModalOpen(true);
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
        errorKind,
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
