import type { Role } from "@asys/contracts";
import { Navigate, useLocation } from "react-router-dom";

import { isRoleRouteAllowed } from "../auth/route-access";
import { useAuth } from "../auth/AuthContext";

type ProtectedRouteProps = {
  allowedRoles?: Role[];
  children: JSX.Element;
};

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/giris" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/panel/yetkisiz" replace />;
  }

  if (!isRoleRouteAllowed(user.role, location.pathname)) {
    return <Navigate to="/panel/yetkisiz" replace />;
  }

  return children;
}
