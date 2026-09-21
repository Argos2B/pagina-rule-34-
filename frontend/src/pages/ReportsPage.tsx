import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listMyReports } from "../api/interactions";
import { ApiError } from "../utils/apiError";
import type { Report } from "../types/api";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { Pagination } from "../components/Pagination";
import styles from "./ReportsPage.module.css";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  reviewed: "Revisado",
  rejected: "Rechazado",
  actioned: "Con acción aplicada",
};

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  const [reports, setReports] = useState<Report[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listMyReports(page);
      setReports(response.results);
      setCount(response.count);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudieron cargar tus reportes.");
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

  return (
    <div>
      <h1>Mis reportes</h1>
      <div style={{ marginTop: "1.25rem" }}>
        {isLoading && <LoadingState label="Cargando reportes…" />}
        {!isLoading && error && <ErrorState message={error} onRetry={load} />}
        {!isLoading && !error && reports.length === 0 && (
          <EmptyState
            title="No has enviado reportes"
            description="Los reportes que envíes sobre publicaciones, comentarios o usuarios aparecerán aquí."
          />
        )}
        {!isLoading && !error && reports.length > 0 && (
          <>
            <ul className={styles.list}>
              {reports.map((report) => (
                <li key={report.id} className={styles.item}>
                  <div className={styles.itemHeader}>
                    <span className={styles.target}>{report.target_type}</span>
                    <span className={`${styles.status} ${styles[report.status]}`}>
                      {STATUS_LABELS[report.status]}
                    </span>
                  </div>
                  <p className={styles.reason}>{report.reason}</p>
                  <time className={styles.date} dateTime={report.created_at}>
                    {new Date(report.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />
          </>
        )}
      </div>
    </div>
  );
}
