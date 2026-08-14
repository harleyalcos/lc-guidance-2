import { useAppUpdate } from "../context/UpdateContext";

interface UpdateBannerProps {
  isSidebarCollapsed: boolean;
}

export default function UpdateBanner({ isSidebarCollapsed }: UpdateBannerProps) {
  const { hasUpdate, updateInfo, isBannerDismissed, dismissBanner, setIsModalOpen } = useAppUpdate();

  if (!hasUpdate || isBannerDismissed || !updateInfo) {
    return null;
  }

  return (
    <aside
      aria-label="Software update notification"
      className={`border-b border-primary/25 bg-[#EEF2FC] dark:bg-[#151D33] text-[#002F87] dark:text-[#b4c5ff] px-margin-page py-2.5 flex items-center justify-between gap-4 transition-[margin-left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isSidebarCollapsed ? "ml-[84px]" : "ml-[280px]"
      } print:hidden animate-fade-in shadow-xs z-10`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20 text-primary dark:text-[#b4c5ff]">
          <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
        </div>
        <p className="text-xs font-medium truncate">
          A new software update (<strong className="font-bold">v{updateInfo.version}</strong>) is available for Laguna College Guidance.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          <span>Review & Install</span>
        </button>
        <button
          type="button"
          onClick={dismissBanner}
          className="text-secondary hover:text-on-surface p-1 rounded-md transition-colors cursor-pointer"
          title="Dismiss banner for this session"
          aria-label="Dismiss banner"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </aside>
  );
}
