import { useEffect, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import Sidebar from "./Sidebar";
import TopAppBar from "./TopAppBar";
import FileNewCaseModal from "./FileNewCaseModal";

interface LayoutProps {
  children: ReactNode;
  title: string;
  pageKey: string;
}

export default function Layout({ children, title, pageKey }: LayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [successToastMessage, setSuccessToastMessage] = useState("");
  const [isSuccessToastVisible, setIsSuccessToastVisible] = useState(false);
  const successToastTimerRef = useRef<number | null>(null);

  const showSuccessToast = (message: string) => {
    setSuccessToastMessage(message);
    setIsSuccessToastVisible(false);
    if (successToastTimerRef.current) window.clearTimeout(successToastTimerRef.current);
    window.requestAnimationFrame(() => setIsSuccessToastVisible(true));
    successToastTimerRef.current = window.setTimeout(() => {
      setIsSuccessToastVisible(false);
      window.setTimeout(() => setSuccessToastMessage(""), 1000);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (successToastTimerRef.current) window.clearTimeout(successToastTimerRef.current);
    };
  }, []);

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
          <TopAppBar title={title} onNewCaseClick={() => setIsNewCaseModalOpen(true)} isSidebarCollapsed={isSidebarCollapsed} />
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
      <FileNewCaseModal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        onCaseFiled={() => showSuccessToast("Case filed successfully.")}
      />
      {successToastMessage && createPortal(
        <div className={`app-toast fixed bottom-5 right-5 z-[99999999] flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-50 px-4 py-3 text-green-900 shadow-xl ${isSuccessToastVisible ? "case-toast-x-enter" : "case-toast-x-exit"}`}>
          <span className="material-symbols-outlined text-green-600" style={{ fontSize: 18 }}>check_circle</span>
          <p className="text-xs font-bold">{successToastMessage}</p>
        </div>,
        document.body
      )}
    </div>
  );
}
