import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import lcLogo from "../assets/lc-logo.png";

interface SidebarProps {
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
}

export default function Sidebar({ isCollapsed, onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isSignOutConfirmClosing, setIsSignOutConfirmClosing] = useState(false);

  const closeSignOutConfirm = () => {
    setIsSignOutConfirmClosing(true);
    setTimeout(() => {
      setShowSignOutConfirm(false);
      setIsSignOutConfirmClosing(false);
    }, 200);
  };

  const navItems = [
    { path: "/", label: "Dashboard", icon: "dashboard", activePaths: ["/"] },
    { path: "/pending", label: "Pending Cases", icon: "pending_actions", activePaths: ["/pending"] },
    { path: "/catalog", label: "Case Catalog", icon: "folder_open", activePaths: ["/catalog", "/case"] },
    { path: "/reports", label: "Reports", icon: "assessment", activePaths: ["/reports"] },
    { path: "/ai", label: "Guidance AI", icon: "smart_toy", activePaths: ["/ai"] },
  ];

  const activeIndex = navItems.findIndex((item) =>
    item.activePaths.some((path) =>
      path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)
    )
  );
  const isProfileActive = location.pathname.startsWith("/account") || location.pathname.startsWith("/backup");

  const getLinkClasses = (index: number) => {
    const isActive = index === activeIndex;
    const baseClasses = `relative z-10 flex h-11 items-center rounded-DEFAULT transition-[color,transform,padding] duration-500 cursor-pointer active:scale-95 group ${isCollapsed ? "justify-center px-0" : "gap-3 px-3.5"
      }`;

    if (isActive) {
      return `${baseClasses} text-primary font-semibold`;
    }

    return `${baseClasses} text-on-surface-variant hover:text-primary`;
  };

  const getIconFill = (index: number) => {
    return index === activeIndex ? 1 : 0;
  };

  return (
    <nav className={`app-sidebar-surface h-screen fixed left-0 top-0 border-r border-outline-variant flex flex-col py-stack-md z-20 transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isCollapsed ? "w-[64px]" : "w-[240px]"
      }`}>
      <button
        type="button"
        onClick={() => onCollapsedChange(!isCollapsed)}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isCollapsed}
        className="absolute right-0 top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-outline-variant bg-surface text-secondary shadow-sm hover:bg-surface-container-low hover:text-primary active:scale-95 transition-[background-color,color,transform] duration-500"
      >
        <span className={`material-symbols-outlined sidebar-collapse-icon ${isCollapsed ? "sidebar-collapse-icon-collapsed" : ""}`} style={{ fontSize: 16 }}>
          chevron_left
        </span>
      </button>

      <div className={`mb-6 mt-3 flex items-center transition-[gap,padding] duration-500 ${isCollapsed ? "justify-center gap-0 px-0" : "gap-3 px-4"
        }`}>
        <img src={lcLogo} alt="Laguna College Logo" className={`${isCollapsed ? "w-9 h-9" : "w-11 h-11"} object-contain shrink-0 transition-[width,height] duration-500`} />
        <div className={`min-w-0 overflow-hidden transition-[opacity,width,transform] duration-300 ${isCollapsed ? "w-0 -translate-x-2 opacity-0" : "w-[150px] translate-x-0 opacity-100"
          }`}>
          <h1 className="whitespace-nowrap text-[15px] leading-[17px] text-primary dark:text-on-surface font-bold" style={{ fontFamily: "Georgia, serif" }}>Laguna College</h1>
          <p className="font-label-caps text-[10px] text-muted mt-1 tracking-wider leading-none">GUIDANCE OFFICE</p>
        </div>
      </div>

      <div className={`relative flex-grow transition-[padding] duration-500 ${isCollapsed ? "px-2" : "px-3.5"}`}>
        {activeIndex >= 0 && (
          <div
            className={`nav-active-indicator ${isCollapsed ? "nav-active-indicator-collapsed" : ""}`}
            style={{ transform: `translateY(${activeIndex * 48}px)` }}
          />
        )}
        <div className="relative flex flex-col gap-1">
          {navItems.map((item, index) => (
            <Link key={item.path} to={item.path} className={getLinkClasses(index)} title={isCollapsed ? item.label : undefined}>
              <span
                className="material-symbols-outlined shrink-0 transition-[font-variation-settings] duration-300 group-hover:[font-variation-settings:'FILL'_1]"
                style={{ fontVariationSettings: `'FILL' ${getIconFill(index)}` }}
              >
                {item.icon}
              </span>
              <span className={`font-body-md text-body-md font-medium whitespace-nowrap overflow-hidden flex items-center gap-2 transition-[opacity,width,transform] duration-300 ${isCollapsed ? "w-0 -translate-x-2 opacity-0" : "w-[150px] translate-x-0 opacity-100"
                }`}>
                {item.label}
                {item.label === "Guidance AI" && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary uppercase tracking-wider mt-0.5">Beta</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className={`relative mt-auto flex flex-col gap-1 border-t border-outline-variant pt-3 transition-[margin,padding] duration-500 ${isCollapsed ? "mx-2 px-0" : "mx-3.5 px-0"
        }`}>
        {isProfileActive && (
          <div
            className={`nav-active-indicator ${isCollapsed ? "nav-active-indicator-collapsed" : ""}`}
            style={{ transform: "translateY(12px)" }}
          />
        )}
        <Link
          to="/account"
          title={isCollapsed ? "Settings" : undefined}
          className={`relative z-10 flex items-center rounded-DEFAULT transition-[color,transform,padding] duration-500 cursor-pointer active:scale-95 w-full text-left group ${isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3.5 py-2.5"
            } ${isProfileActive ? "text-primary font-semibold" : "text-on-surface-variant hover:text-primary"}`}
        >
          <span
            className="material-symbols-outlined shrink-0 transition-[font-variation-settings] duration-300 group-hover:[font-variation-settings:'FILL'_1]"
            style={{ fontVariationSettings: `'FILL' ${isProfileActive ? 1 : 0}` }}
          >
            settings
          </span>
          <span className={`font-body-md text-body-md font-medium whitespace-nowrap overflow-hidden transition-[opacity,width,transform] duration-300 ${isCollapsed ? "w-0 -translate-x-2 opacity-0" : "w-[150px] translate-x-0 opacity-100"
            }`}>Settings</span>
        </Link>
        
        <button
          onClick={() => setShowSignOutConfirm(true)}
          title={isCollapsed ? "Sign Out" : undefined}
          className={`relative z-10 flex items-center rounded-DEFAULT transition-[color,transform,padding] duration-500 cursor-pointer active:scale-95 w-full text-left group ${isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3.5 py-2.5"
            } text-on-surface-variant hover:text-error`}
        >
          <span
            className="material-symbols-outlined shrink-0 transition-[font-variation-settings] duration-300 group-hover:[font-variation-settings:'FILL'_1]"
            style={{ fontVariationSettings: `'FILL' 0` }}
          >
            logout
          </span>
          <span className={`font-body-md text-body-md font-medium whitespace-nowrap overflow-hidden transition-[opacity,width,transform] duration-300 ${isCollapsed ? "w-0 -translate-x-2 opacity-0" : "w-[150px] translate-x-0 opacity-100"
            }`}>Sign Out</span>
        </button>
      </div>

      {showSignOutConfirm && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className={`absolute inset-0 bg-black/45 ${isSignOutConfirmClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
              }`}
            style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={closeSignOutConfirm}
          />
          <div className={`relative bg-surface p-6 rounded-2xl shadow-xl max-w-sm w-full border border-outline-variant ${isSignOutConfirmClosing ? "modal-panel-exit" : "modal-panel-enter"
            }`}>
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-3">
              <span className="material-symbols-outlined text-[28px]">logout</span>
              <h3 className="text-xl font-bold text-on-surface">Confirm Sign Out</h3>
            </div>
            <p className="text-secondary text-sm mb-6 leading-relaxed">
              Are you sure you want to sign out? You will need to enter your PIN again to access the guidance system.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={closeSignOutConfirm}
                className="btn-secondary flex-1 px-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary flex-1 px-2 whitespace-nowrap bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 border-0"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
  );
}
