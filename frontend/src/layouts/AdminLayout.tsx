import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { isAdminOrAbove } from "../utils/roles";
import styles from "./AdminLayout.module.css";

export function AdminLayout() {
  const { user } = useAuth();
  const canSeeUsers = isAdminOrAbove(user?.role);

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <p className={styles.title}>Panel administrativo</p>
        <nav className={styles.nav}>
          <NavLink to="/admin" end className={styles.link}>
            Resumen
          </NavLink>
          <NavLink to="/admin/reports" className={styles.link}>
            Reportes
          </NavLink>
          {canSeeUsers && (
            <>
              <NavLink to="/admin/users" className={styles.link}>
                Usuarios
              </NavLink>
              <NavLink to="/admin/audit-logs" className={styles.link}>
                Auditoría
              </NavLink>
            </>
          )}
        </nav>
        <p className={styles.disclaimer}>
          Esta interfaz solo oculta opciones. La autorización real la aplica el backend en cada
          solicitud.
        </p>
      </aside>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
