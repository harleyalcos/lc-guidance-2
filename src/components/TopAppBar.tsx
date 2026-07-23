import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

interface TopAppBarProps {
  title: string;
  onNewCaseClick?: () => void;
  isSidebarCollapsed?: boolean;
}

export default function TopAppBar({ title, onNewCaseClick, isSidebarCollapsed = false }: TopAppBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isCaseDetails = location.pathname.startsWith("/case/");
  const showBackButton = isCaseDetails;
  const showNewCaseButton = location.pathname === "/catalog" || location.pathname === "/pending" || location.pathname === "/";

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const checkPending = () => {
      try {
        const stored = localStorage.getItem("lc_pending_import_rows");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setPendingCount(parsed.length);
            return;
          }
        }
      } catch { }
      setPendingCount(0);
    };

    checkPending();
    window.addEventListener("storage", checkPending);
    window.addEventListener("focus", checkPending);
    return () => {
      window.removeEventListener("storage", checkPending);
      window.removeEventListener("focus", checkPending);
    };
  }, [location.pathname]);

  return (
    <header className={`app-topbar-surface h-16 sticky top-0 border-b border-outline-variant dark:border-on-surface-variant flex items-center justify-between px-margin-page min-w-0 z-10 transition-[background-color,border-color,margin-left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSidebarCollapsed ? "ml-[84px]" : "ml-[280px]"
      }`}>
      <div className="flex items-center gap-4 flex-1">
        {showBackButton && (
          <Link to={-1 as any} className="text-secondary hover:text-primary transition-colors duration-500">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        )}
        <h2 className="font-section-header text-section-header text-primary dark:text-primary-fixed-dim font-bold shrink-0">{title}</h2>
      </div>

      <div className="flex items-center gap-4">

        {showNewCaseButton && (
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={() => navigate("/import-review")}
                className="border-2 border-[#FAC775] text-[#B06000] bg-[#FEF7E0] hover:bg-[#FEEFC3] font-bold py-2.5 px-6 rounded-xl flex items-center justify-center gap-1.5 text-xs transition-all duration-300 shadow-sm cursor-pointer"
                title="Click to resume pending imports review"
              >
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>pending</span>
                <span>{pendingCount} Pending {pendingCount === 1 ? "Import" : "Imports"}</span>
              </button>
            )}
            <button onClick={onNewCaseClick} className="btn-primary ml-2">
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Case</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
