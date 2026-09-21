import styles from "./LoadingState.module.css";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Cargando…" }: LoadingStateProps) {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
