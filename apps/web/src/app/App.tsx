import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthenticatedApp } from "./AuthenticatedApp";
import { LoginPage } from "../features/auth/LoginPage";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AuthenticatedApp />} />
        <Route path="/upload" element={<AuthenticatedApp />} />
        <Route path="/upload/:docId" element={<AuthenticatedApp />} />
        <Route path="/records" element={<AuthenticatedApp />} />
        <Route path="/records/:docId" element={<AuthenticatedApp />} />
        <Route path="/clients" element={<AuthenticatedApp />} />
        <Route path="/clients/:clientId" element={<AuthenticatedApp />} />
        <Route path="/registers" element={<AuthenticatedApp />} />
        <Route path="/audit" element={<AuthenticatedApp />} />
        {/* TIER 2 Routes */}
        <Route path="/deadlines" element={<AuthenticatedApp />} />
        <Route path="/reconciliation" element={<AuthenticatedApp />} />
        <Route path="/tax-liability" element={<AuthenticatedApp />} />
        <Route path="/amendments" element={<AuthenticatedApp />} />
        {/* TIER 3 Integration Routes */}
        <Route path="/integrations/zoho" element={<AuthenticatedApp />} />
        <Route path="/integrations/gst-portal" element={<AuthenticatedApp />} />
        <Route path="/integrations/email" element={<AuthenticatedApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
