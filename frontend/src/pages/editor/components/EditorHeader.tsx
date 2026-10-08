/**
 * EditorHeader — Project bar at the top of the editor.
 * Contains: brand, project name, status, undo/redo, save, close.
 */

import { useState } from "react";
import type { EditorProject } from "../types/editor.types";
import styles from "../EditorPage.module.css";

interface EditorHeaderProps {
  project: EditorProject;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onResetWorkspace: () => void;
  onSaveWorkspace: () => void;
  onSetProjectName: (name: string) => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<EditorProject["status"], string> = {
  new: "Nuevo",
  modified: "Sin guardar",
  saving: "Guardando…",
  saved: "Guardado",
  error: "Error",
};

const STATUS_CLASS: Record<EditorProject["status"], string> = {
  new: styles.statusNew,
  modified: styles.statusModified,
  saving: styles.statusSaving,
  saved: styles.statusSaved,
  error: styles.statusError,
};

export function EditorHeader({
  project,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onResetWorkspace,
  onSaveWorkspace,
  onSetProjectName,
  onClose,
}: EditorHeaderProps) {
  const [editingName, setEditingName] = useState(false);

  return (
    <header className={styles.editorHeader} role="banner">
      {/* ── Left: brand + project name ── */}
      <div className={styles.headerLeft}>
        <div className={styles.headerBrand} title="Editor de Vídeo">
          <div className={styles.headerBrandIcon} aria-hidden="true">▶</div>
          <span className={styles.headerBrandText}>Editor</span>
        </div>

        <div className={styles.headerDivider} aria-hidden="true" />

        <div className={styles.projectNameWrapper}>
          <input
            id="editor-project-name"
            type="text"
            className={styles.projectNameInput}
            value={project.name}
            aria-label="Nombre del proyecto"
            title="Haz clic para renombrar el proyecto"
            onChange={(e) => onSetProjectName(e.target.value)}
            onFocus={() => setEditingName(true)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          {!editingName && (
            <span
              className={`${styles.projectStatus} ${STATUS_CLASS[project.status]}`}
              aria-live="polite"
            >
              {STATUS_LABELS[project.status]}
            </span>
          )}
        </div>
      </div>

      {/* ── Center: undo/redo ── */}
      <div className={styles.headerCenter}>
        <button
          id="editor-undo-btn"
          type="button"
          className={styles.headerIconBtn}
          onClick={onUndo}
          disabled={!canUndo}
          title="Deshacer (Ctrl+Z)"
          aria-label="Deshacer"
        >
          ↩
        </button>
        <button
          id="editor-redo-btn"
          type="button"
          className={styles.headerIconBtn}
          onClick={onRedo}
          disabled={!canRedo}
          title="Rehacer (Ctrl+Y)"
          aria-label="Rehacer"
        >
          ↪
        </button>
      </div>

      {/* ── Right: save + close ── */}
      <div className={styles.headerRight}>
        <button
          id="editor-reset-workspace-btn"
          type="button"
          className={styles.btnSave}
          onClick={onResetWorkspace}
          title="Restaurar layout profesional"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Reset Workspace
        </button>

        <button
          id="editor-save-layout-btn"
          type="button"
          className={styles.btnSave}
          onClick={onSaveWorkspace}
          title="Guardar distribución actual"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Workspace
        </button>

        <button
          id="editor-save-btn"
          type="button"
          className={styles.btnSave}
          onClick={onSave}
          disabled={project.status === "saving"}
          title="Guardar proyecto"
        >
          {project.status === "saving" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          )} Guardar
        </button>

        <button
          id="editor-close-btn"
          type="button"
          className={styles.btnClose}
          onClick={onClose}
          title="Cerrar editor"
        >
          ✕ Salir
        </button>
      </div>
    </header>
  );
}
