import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthenticatedApp } from "./AuthenticatedApp";
import { LoginPage } from "../features/auth/LoginPage";

export default function App() {
  return (
    <BrowserRouter>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
