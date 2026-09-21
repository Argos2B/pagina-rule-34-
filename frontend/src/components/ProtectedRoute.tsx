import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import type { Role } from "../types/api";
import { hasRoleAtLeast } from "../utils/roles";
import { LoadingState } from "./LoadingState";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Minimum role required to view this route (UI convenience only — the
   * backend is the real authority on every request). */
  minRole?: Role;
}

export function ProtectedRoute({ children, minRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Verificando sesión…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (minRole && !hasRoleAtLeast(user?.role, minRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
