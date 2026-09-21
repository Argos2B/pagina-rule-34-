import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getModerationStats } from "../../api/moderation";
import { ApiError } from "../../utils/apiError";
import type { ModerationStats } from "../../types/api";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import styles from "./AdminDashboardPage.module.css";

export function AdminDashboardPage() {
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    getModerationStats()
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.displayMessage : "No se pudieron cargar las estadísticas."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  if (isLoading) return <LoadingState label="Cargando resumen…" />;
  if (error || !stats) return <ErrorState message={error ?? "Sin datos."} onRetry={load} />;

  return (
    <div>
      <h1>Resumen de moderación</h1>
      <div className={styles.grid}>
        {Object.entries(stats).map(([key, value]) => (
          <div key={key} className={styles.card}>
            <span className={styles.value}>{String(value)}</span>
            <span className={styles.label}>{key.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>
      <div className={styles.links}>
        <Link to="/admin/reports">Ver reportes</Link>
        <Link to="/admin/users">Gestionar usuarios</Link>
        <Link to="/admin/audit-logs">Ver auditoría</Link>
      </div>
    </div>
  );
}
