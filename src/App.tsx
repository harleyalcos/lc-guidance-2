import { useDialogAccessibility } from "./hooks/useDialogAccessibility";
import { useEffect, useState } from "react";
import { HashRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import { describeError } from "./utils/errors";
import SummaryReports from "./pages/SummaryReports";
import Dashboard from "./pages/Dashboard";
import CaseCatalog from "./pages/CaseCatalog";
import CaseDetails from "./pages/CaseDetails";
import GroupCaseDetails from "./pages/GroupCaseDetails";
import PendingCases from "./pages/PendingCases";
import AccountSettings from "./pages/AccountSettings";
import ImportReview from "./pages/ImportReview";
import SignIn from "./pages/SignIn";
import GuidanceAI from "./pages/GuidanceAI";
import CaseDistribution from "./pages/CaseDistribution";
import { AcademicYearFilterProvider } from "./context/AcademicYearFilterContext";
import { UpdateProvider } from "./context/UpdateContext";
import "./App.css";

function AppRoutes() {
  const location = useLocation();

  const getTitle = () => {
    if (location.pathname.startsWith("/case/") || location.pathname.startsWith("/group-case/")) return "Case Catalog";
    if (location.pathname === "/catalog") return "Case Catalog";
    if (location.pathname === "/distribution") return "Case Distribution";
    if (location.pathname === "/pending") return "Pending Cases";
    if (location.pathname === "/backup") return "Settings";
    if (location.pathname === "/account") return "Settings";
    if (location.pathname === "/import-review") return "Import Review";
    if (location.pathname === "/reports") return "Reports";
    if (location.pathname === "/ai") return "Guidance AI";
    return "Dashboard";
  };

  return (
    <AcademicYearFilterProvider>
      <Layout title={getTitle()} pageKey={location.pathname}>
        <ErrorBoundary variant="page" resetKey={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/distribution" element={<CaseDistribution />} />
          <Route path="/reports" element={<SummaryReports />} />
          <Route path="/catalog" element={<CaseCatalog />} />
          <Route path="/pending" element={<PendingCases />} />
          <Route path="/case/:id" element={<CaseDetails />} />
          <Route path="/group-case/:groupId" element={<GroupCaseDetails />} />
          <Route path="/backup" element={<Navigate to="/account?tab=backup" replace />} />
          <Route path="/account" element={<AccountSettings />} />
          <Route path="/import-review" element={<ImportReview />} />
          <Route path="/ai" element={<GuidanceAI />} />
          {/* Unknown or stale links (e.g. bookmarks from older versions) return to the dashboard. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </Layout>
    </AcademicYearFilterProvider>
  );
}

function App() {
  useDialogAccessibility();
  const [startupError, setStartupError] = useState<unknown>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // Check if app version was bumped/updated; clear stale pending imports from prior versions
  useEffect(() => {
    getVersion()
      .then((currentVersion) => {
        // Staged work is revalidated on resume rather than discarded on update.
        localStorage.setItem("lc_app_version", currentVersion);
      })
      .catch(() => {
        // Version tracking is informational only; the app works without it.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStartupError(null);
    invoke("sign_out").then(() => invoke<boolean>("check_setup_complete"))
      .then((complete) => { if (!cancelled) setIsSetupComplete(Boolean(complete)); })
      .catch((error) => { if (!cancelled) setStartupError(error ?? "Unknown startup error"); });
    return () => { cancelled = true; };
  }, [startupAttempt]);

  if (startupError) {
    const friendly = describeError(startupError, {
      title: "Unable to open the guidance database",
      message: "The app could not read its database while starting up.",
      guidance: "Click Retry. If it still fails, restart the computer. Keep your database and backup folders — do not delete them — and contact school IT support with the technical details below.",
    });
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center p-6 bg-background text-on-surface">
        <div className="max-w-lg w-full bg-surface dark:bg-surface-container border border-outline-variant rounded-2xl p-8 shadow-xl flex flex-col gap-4 text-center items-center">
          <div className="w-14 h-14 rounded-2xl bg-error/10 text-error flex items-center justify-center" aria-hidden="true">
            <span className="material-symbols-outlined text-[32px]">database</span>
          </div>
          <h1 className="text-xl font-bold">{friendly.title}</h1>
          <p className="text-sm leading-relaxed">{friendly.message}</p>
          {friendly.reason && <p className="text-sm leading-relaxed">{friendly.reason}</p>}
          <p className="text-sm text-secondary leading-relaxed">{friendly.guidance}</p>
          {friendly.details && (
            <details className="w-full text-left rounded-xl border border-outline-variant bg-surface-container-low">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-secondary">Technical details</summary>
              <pre className="px-3 pb-3 text-[11px] font-mono text-error whitespace-pre-wrap break-all">{friendly.details}</pre>
            </details>
          )}
          <button type="button" className="btn-primary" onClick={() => setStartupAttempt((n) => n + 1)}>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }
  if (isSetupComplete === null) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-on-surface">
        <div className="flex items-center gap-3 text-sm font-bold text-secondary">
          <span className="material-symbols-outlined animate-spin">sync</span>
          <span>Loading security setup...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <SignIn
        isSetupComplete={isSetupComplete}
        onSetupComplete={() => setIsSetupComplete(true)}
        onSignIn={() => setIsAuthenticated(true)}
      />
    );
  }

  return (
    <UpdateProvider>
      <Router>
        <AppRoutes />
      </Router>
    </UpdateProvider>
  );
}

export default App;
