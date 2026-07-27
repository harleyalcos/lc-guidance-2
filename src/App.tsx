import { useEffect, useState } from "react";
import { HashRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Layout from "./components/Layout";
import SummaryReports from "./pages/SummaryReports";
import Dashboard from "./pages/Dashboard";
import CaseCatalog from "./pages/CaseCatalog";
import CaseDetails from "./pages/CaseDetails";
import PendingCases from "./pages/PendingCases";
import AccountSettings from "./pages/AccountSettings";
import ImportReview from "./pages/ImportReview";
import SignIn from "./pages/SignIn";
import GuidanceAI from "./pages/GuidanceAI";
import "./App.css";

function AppRoutes() {
  const location = useLocation();

  const getTitle = () => {
    if (location.pathname.startsWith("/case/")) return "Case Details";
    if (location.pathname === "/catalog") return "Guidance Office";
    if (location.pathname === "/pending") return "Pending Cases";
    if (location.pathname === "/backup") return "Settings & Security";
    if (location.pathname === "/account") return "Settings & Security";
    if (location.pathname === "/import-review") return "Import Review";
    if (location.pathname === "/reports") return "Reports";
    if (location.pathname === "/ai") return "Guidance AI";
    return "Dashboard";
  };

  return (
    <Layout title={getTitle()} pageKey={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<SummaryReports />} />
        <Route path="/catalog" element={<CaseCatalog />} />
        <Route path="/pending" element={<PendingCases />} />
        <Route path="/case/:id" element={<CaseDetails />} />
        <Route path="/backup" element={<Navigate to="/account?tab=backup" replace />} />
        <Route path="/account" element={<AccountSettings />} />
        <Route path="/import-review" element={<ImportReview />} />
        <Route path="/ai" element={<GuidanceAI />} />
      </Routes>
    </Layout>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>("check_setup_complete")
      .then(setIsSetupComplete)
      .catch(() => setIsSetupComplete(false));
  }, []);

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
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
