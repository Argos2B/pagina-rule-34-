import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { listAuditLogs } from "../../api/moderation";
import { ApiError } from "../../utils/apiError";
import type { AuditLog } from "../../types/api";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Pagination } from "../../components/Pagination";
import styles from "./AdminAuditLogPage.module.css";

const PAGE_SIZE = 20;

export function AdminAuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listAuditLogs({ page });
      setLogs(response.results);
      setCount(response.count);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "No se pudo cargar el registro de auditoría.");
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

  if (isLoading) return <LoadingState label="Cargando auditoría…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <h1>Registro de auditoría</h1>
      {logs.length === 0 ? (
        <EmptyState title="Sin registros" description="Aún no se han registrado acciones de moderación." />
      ) : (
        <>
          <ul className={styles.list}>
            {logs.map((log) => (
              <li key={log.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.action}>{log.action}</span>
                  <time className={styles.date} dateTime={log.created_at}>
                    {new Date(log.created_at).toLocaleString()}
                  </time>
                </div>
                <p>
                  {log.actor_username ? `@${log.actor_username}` : "Sistema"} → {log.target_type} #{log.target_id}
                </p>
                {log.reason && <p className={styles.reason}>{log.reason}</p>}
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPageChange={goToPage} />
        </>
      )}
    </div>
  );
}
