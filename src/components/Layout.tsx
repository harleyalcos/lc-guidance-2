import { useState, ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopAppBar from "./TopAppBar";

interface LayoutProps {
  children: ReactNode;
  title: string;
  pageKey: string;
}

export default function Layout({ children, title, pageKey }: LayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const isImportReview = pageKey === "/import-review";
  const isPendingPage = pageKey === "/pending";
  const isAiPage = pageKey === "/ai";
  const isEdgeToEdge = isImportReview || isPendingPage || isAiPage;

  return (
    <div className="app-shell text-on-background font-body-md text-body-md antialiased min-h-screen overflow-x-hidden">
      <div className="app-fullscreen-backdrop print:hidden" aria-hidden="true" />
      <div className="print:hidden">
        <Sidebar isCollapsed={isSidebarCollapsed} onCollapsedChange={setIsSidebarCollapsed} />
      </div>
      <div className="print:hidden">
        {!isImportReview && (
          <TopAppBar title={title} isSidebarCollapsed={isSidebarCollapsed} />
        )}
      </div>
      <main className={`print:ml-0 print:min-h-0 print:p-0 transition-[margin-left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSidebarCollapsed ? "ml-[84px]" : "ml-[280px]"
        } ${isImportReview
          ? "h-screen flex flex-col overflow-hidden"
          : (isPendingPage || isAiPage)
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
