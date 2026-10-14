import { useDialogAccessibility } from "./hooks/useDialogAccessibility";
import { useEffect, useState } from "react";
import { HashRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import Layout from "./components/Layout";
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
        </Routes>
      </Layout>
    </AcademicYearFilterProvider>
  );
}

function App() {
  useDialogAccessibility();
  const [startupError, setStartupError] = useState<string | null>(null);
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
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke("sign_out").then(() => invoke<boolean>("check_setup_complete"))
      .then(setIsSetupComplete)
      .catch((error) => setStartupError(String(error)));
  }, []);

  if (startupError) return <div role="alert" className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background text-on-surface"><h1 className="text-xl font-bold">Unable to open the guidance database</h1><p>{startupError}</p><button className="btn-primary" onClick={() => window.location.reload()}>Retry</button><p>Keep your database and backups. Contact the school IT staff if retry does not help.</p></div>;
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
