import { useState, ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopAppBar from "./TopAppBar";
import UpdateBanner from "./UpdateBanner";
import UpdateModal from "./UpdateModal";

interface LayoutProps {
  children: ReactNode;
  title: string;
  pageKey: string;
}

export default function Layout({ children, title, pageKey }: LayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("lc_sidebar_collapsed");
    return saved !== null ? saved === "true" : false;
  });

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    try {
      localStorage.setItem("lc_sidebar_collapsed", String(collapsed));
    } catch {
      // ignore
    }
  };

  const isImportReview = pageKey === "/import-review";
  const isPendingPage = pageKey === "/pending";
  const isAiPage = pageKey === "/ai";
  const isEdgeToEdge = isImportReview || isPendingPage || isAiPage;

  return (
    <div className="app-shell text-on-background font-body-md text-body-md antialiased min-h-screen overflow-x-hidden">
      <div className="app-fullscreen-backdrop print:hidden" aria-hidden="true" />
      <div className="print:hidden">
        <Sidebar isCollapsed={isSidebarCollapsed} onCollapsedChange={handleSidebarCollapsedChange} />
      </div>
      <div className="print:hidden sticky top-0 z-20">
        {!isImportReview && !isAiPage && (
          <TopAppBar title={title} isSidebarCollapsed={isSidebarCollapsed} />
        )}
        <UpdateBanner isSidebarCollapsed={isSidebarCollapsed} />
      </div>
      <UpdateModal />
      <main className={`print:ml-0 print:min-h-0 print:p-0 transition-[margin-left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSidebarCollapsed ? "ml-[64px]" : "ml-[240px]"
        } ${(isImportReview || isAiPage)
          ? "h-screen flex flex-col overflow-hidden"
          : isPendingPage
            ? "h-[calc(100vh-64px)] flex flex-col overflow-hidden"
            : "min-h-[calc(100vh-64px)] p-margin-page gap-gutter pb-12"
        }`}>
        <div key={pageKey} className={`page-transition flex flex-col ${isEdgeToEdge ? "h-full overflow-hidden" : "gap-gutter"}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
