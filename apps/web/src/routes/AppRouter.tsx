import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "../components/ProtectedRoute";
import { LoginPage } from "./LoginPage";
import {
  AdminShellPage,
  ResidentShellPage,
  SecurityShellPage,
  UnauthorizedPage
} from "./RoleShellPage";
import { ShellPanel } from "./ShellPanel";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/panel" replace />} />
      <Route path="/giris" element={<LoginPage />} />
      <Route
        path="/panel"
        element={
          <ProtectedRoute>
            <ShellPanel />
          </ProtectedRoute>
        }
      >
        <Route index element={<p>Role uygun kabugu secmek icin menuden bir alan acin.</p>} />
        <Route
          path="admin"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <AdminShellPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="resident"
          element={
            <ProtectedRoute allowedRoles={["RESIDENT"]}>
              <ResidentShellPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="security"
          element={
            <ProtectedRoute allowedRoles={["SECURITY"]}>
              <SecurityShellPage />
            </ProtectedRoute>
          }
        />
        <Route path="yetkisiz" element={<UnauthorizedPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/giris" replace />} />
    </Routes>
  );
}
