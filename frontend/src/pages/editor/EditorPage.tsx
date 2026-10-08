/**
 * EditorPage — Main video editor interface.
 *
 * Full-viewport layout (no Navbar/Footer).
 * Keyboard shortcuts handled here at window level.
 */

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEditorState } from "./hooks/useEditorState";
import { EditorHeader } from "./components/EditorHeader";
import { MediaPanel } from "./components/MediaPanel";
import { ToolSidebar } from "./components/ToolSidebar";
import { PreviewPanel } from "./components/PreviewPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { Timeline } from "./components/Timeline";
import { ColorWorkspace } from "./components/ColorWorkspace";
import type { EditorClip } from "./types/editor.types";
import styles from "./EditorPage.module.css";

function getSelectedClip(project: ReturnType<typeof useEditorState>["state"]["project"], clipIds: string[]): EditorClip | undefined {
  if (!clipIds.length) return undefined;
  for (const track of project.tracks) {
    const clip = track.clips.find((item) => item.id === clipIds[0]);
    if (clip) return clip;
  }
  return undefined;
}

function ResizeHandle({
  axis,
  onResize,
}: {
  axis: "horizontal" | "vertical";
  onResize: (nextSize: number) => void;
}) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: MouseEvent) => {
      const delta = axis === "horizontal" ? event.movementX : event.movementY;
      onResize(delta);
    };

    const handleUp = () => setDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [axis, dragging, onResize]);

  return (
    <div
      className={axis === "horizontal" ? styles.resizeHandleHorizontal : styles.resizeHandleVertical}
      role="separator"
      aria-orientation={axis}
      onMouseDown={() => setDragging(true)}
      title={axis === "horizontal" ? "Cambiar ancho del panel" : "Cambiar alto del panel"}
    />
  );
}

export function EditorPage() {
  const navigate = useNavigate();
  const editor = useEditorState();
  const selectedClip = getSelectedClip(editor.state.project, editor.state.selection.clipIds);

  function handleClose() {
    navigate("/");
  }

  const saveWorkspace = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("editor-workspace-layout-v1", JSON.stringify(editor.state.layout));
    }
  };

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (e.code === "Space") {
        e.preventDefault();
        editor.togglePlay();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        editor.deleteSelectedClips();
        return;
      }

      if (e.key.toLowerCase() === "s" && !ctrl) {
        e.preventDefault();
        editor.splitClip();
        return;
      }

      if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        editor.duplicateSelectedClips();
        return;
      }

      if (ctrl && e.key.toLowerCase() === "c") {
        e.preventDefault();
        editor.copySelectedClip();
        return;
      }

      if (ctrl && e.key.toLowerCase() === "v") {
        e.preventDefault();
        editor.pasteClip();
        return;
      }

      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }

      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        editor.saveProject();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  return (
    <>
      {/* Mobile notice */}
      <div className={styles.mobileNotice} role="alert">
        <div className={styles.mobileIcon}>🖥️</div>
        <h2 className={styles.mobileTitle}>Editor optimizado para escritorio</h2>
        <p className={styles.mobileText}>
          El editor de vídeo requiere una pantalla de al menos 900px de ancho
          para una experiencia profesional óptima.
        </p>
      </div>

      {/* Full-screen editor */}
      <div className={styles.editorPage} role="main" id="editor-root">
        {/* Header */}
        <EditorHeader
          project={editor.state.project}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onSave={editor.saveProject}
          onResetWorkspace={editor.resetWorkspaceLayout}
          onSaveWorkspace={saveWorkspace}
          onSetProjectName={editor.setProjectName}
          onClose={handleClose}
        />

        <div className={styles.editorBody}>
          {editor.state.layout.panels.media.visible && (
            <>
              <div className={styles.leftPanel} style={{ width: editor.state.layout.mediaWidth }}>
                <div className={styles.panelHeaderCompact}>
                  <span>Media</span>
                  <button type="button" className={styles.panelHeaderButton} onClick={() => editor.setPanelVisibility("media", false)}>Hide</button>
                </div>
                <ToolSidebar
                  activeTool={editor.state.activeTool}
                  onSetTool={editor.setActiveTool}
                />
                <MediaPanel
                  assets={editor.state.project.assets}
                  activeTab={editor.state.activeMediaTab}
                  onSetTab={editor.setActiveMediaTab}
                  onAddAsset={editor.addAsset}
                  onRemoveAsset={editor.removeAsset}
                />
              </div>
              <ResizeHandle
                axis="horizontal"
                onResize={(delta) =>
                  editor.setPanelSize("media", { width: Math.min(420, Math.max(180, editor.state.layout.mediaWidth + delta)) })
                }
              />
            </>
          )}

          <div className={styles.centerArea}>
            <div className={styles.workspaceSwitcher} aria-label="Workspace del editor">
              {[
                { id: "edit", label: "Edit" },
                { id: "color", label: "Color" },
                { id: "audio", label: "Audio" },
                { id: "effects", label: "Effects" },
              ].map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className={`${styles.workspaceTab} ${editor.state.activeWorkspace === workspace.id ? styles.workspaceTabActive : ""}`}
                  onClick={() => editor.setActiveWorkspace(workspace.id as any)}
                >
                  {workspace.label}
                </button>
              ))}
            </div>

            <div className={styles.previewSection} style={{ height: editor.state.layout.previewHeight }}>
              <PreviewPanel
                project={editor.state.project}
                playback={editor.state.playback}
                onPlay={editor.play}
                onPause={editor.pause}
                onTogglePlay={editor.togglePlay}
                onSeek={editor.setCurrentTime}
                onSetVolume={editor.setVolume}
                onToggleMute={editor.toggleMute}
              />
            </div>

            <ResizeHandle
              axis="vertical"
              onResize={(delta) =>
                editor.setPanelSize("preview", { height: Math.min(700, Math.max(260, editor.state.layout.previewHeight + delta)) })
              }
            />

            {editor.state.activeWorkspace === "color" ? (
              <ColorWorkspace selectedClip={selectedClip} onUpdateClip={editor.updateClip} />
            ) : (
              <div className={styles.timelineSection} style={{ height: editor.state.layout.timelineHeight }}>
                <Timeline
                  project={editor.state.project}
                  playback={editor.state.playback}
                  timeline={editor.state.timeline}
                  onSelectClip={editor.selectClip}
                  onClearSelection={editor.clearSelection}
                  onSeek={editor.setCurrentTime}
                  onSetScale={editor.setTimelineScale}
                  onSetScroll={editor.setTimelineScroll}
                  onUpdateTrack={editor.updateTrack}
                  onAddTrack={editor.addTrack}
                  onAddClip={editor.addClip}
                  onMoveClip={editor.moveClip}
                  onTrimClip={editor.trimClip}
                  onUpdateProjectSettings={editor.updateProjectSettings}
                />
              </div>
            )}
          </div>

          {editor.state.layout.panels.inspector.visible && (
            <>
              <ResizeHandle
                axis="horizontal"
                onResize={(delta) =>
                  editor.setPanelSize("inspector", { width: Math.min(420, Math.max(220, editor.state.layout.inspectorWidth + delta)) })
                }
              />
              <div className={styles.rightPanel} style={{ width: editor.state.layout.inspectorWidth }}>
                <div className={styles.panelHeaderCompact}>
                  <span>Inspector</span>
                  <button type="button" className={styles.panelHeaderButton} onClick={() => editor.setPanelVisibility("inspector", false)}>Hide</button>
                </div>
                <InspectorPanel
                  state={editor.state}
                  onUpdateClip={editor.updateClip}
                  onSetTab={editor.setActiveInspectorTab}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
