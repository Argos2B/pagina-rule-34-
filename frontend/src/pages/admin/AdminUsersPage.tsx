import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listUsers, reactivateUser, suspendUser, updateUserRole } from "../../api/users";
import { useAuth } from "../../auth/useAuth";
import { ApiError } from "../../utils/apiError";
import type { AdminUser, Role } from "../../types/api";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { Pagination } from "../../components/Pagination";
import styles from "./AdminUsersPage.module.css";

const PAGE_SIZE = 20;
const ROLE_OPTIONS: Role[] = ["user", "moderator", "admin", "superadmin"];

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listUsers({ page });
      setUsers(response.results);
      setCount(response.count);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudieron cargar los usuarios.");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(nextPage));
    setSearchParams(next);
  }

  async function handleRoleChange(id: number, role: Role) {
    setActionError(null);
    try {
      const updated = await updateUserRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.displayMessage : "No se pudo actualizar el rol.");
    }
  }

  async function handleToggleActive(target: AdminUser) {
    setActionError(null);
    try {
      const updated = target.is_active ? await suspendUser(target.id) : await reactivateUser(target.id);
      setUsers((prev) => prev.map((u) => (u.id === target.id ? updated : u)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.displayMessage : "No se pudo actualizar el estado del usuario.");
    }
  }

  if (isLoading) return <LoadingState label="Cargando usuarios…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <h1>Usuarios</h1>
      {actionError && <p className="field-error">{actionError}</p>}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((target) => (
              <tr key={target.id}>
                <td>{target.username}</td>
                <td>{target.email}</td>
                <td>
                  <select
                    value={target.role}
                    disabled={target.id === currentUser?.id}
                    onChange={(event) => handleRoleChange(target.id, event.target.value as Role)}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{target.is_active ? "Activo" : "Suspendido"}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={target.id === currentUser?.id}
                    onClick={() => handleToggleActive(target)}
                  >
                    {target.is_active ? "Suspender" : "Reactivar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />
    </div>
  );
}
