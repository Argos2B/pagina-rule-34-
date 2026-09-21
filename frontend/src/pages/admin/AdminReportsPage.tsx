import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listMyReports, resolveReport } from "../../api/interactions";
import { ApiError } from "../../utils/apiError";
import type { Report, ReportStatus } from "../../types/api";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Pagination } from "../../components/Pagination";
import styles from "./AdminReportsPage.module.css";

const PAGE_SIZE = 20;
const RESOLUTION_OPTIONS: ReportStatus[] = ["reviewed", "rejected", "actioned"];

export function AdminReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  const [reports, setReports] = useState<Report[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // This endpoint returns every report for moderators/admins, and only
      // the caller's own reports for regular users (backend-enforced).
      const response = await listMyReports(page);
      setReports(response.results);
      setCount(response.count);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudieron cargar los reportes.");
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

  async function handleResolve(reportId: number, status: ReportStatus) {
    setActionError(null);
    try {
      const updated = await resolveReport(reportId, status);
      setReports((prev) => prev.map((report) => (report.id === reportId ? updated : report)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.displayMessage : "No se pudo resolver el reporte.");
    }
  }

  return (
    <div>
      <h1>Reportes</h1>
      {actionError && <p className="field-error">{actionError}</p>}
      {isLoading && <LoadingState label="Cargando reportes…" />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && reports.length === 0 && (
        <EmptyState title="No hay reportes" description="No se encontraron reportes pendientes de revisión." />
      )}
      {!isLoading && !error && reports.length > 0 && (
        <>
          <ul className={styles.list}>
            {reports.map((report) => (
              <li key={report.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.target}>{report.target_type}</span>
                  <span className={styles.status}>{report.status}</span>
                </div>
                <p>
                  Reportado por <strong>@{report.reporter_username}</strong>
                </p>
                <p>{report.reason}</p>
                {report.details && <p className={styles.details}>{report.details}</p>}
                {report.status === "pending" && (
                  <div className={styles.actions}>
                    {RESOLUTION_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleResolve(report.id, option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />
        </>
      )}
    </div>
  );
}
