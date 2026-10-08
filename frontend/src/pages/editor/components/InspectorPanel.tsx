/**
 * InspectorPanel — Properties inspector.
 * ALL fields are connected to real clip state.
 */

import type { EditorState, EditorClip, InspectorTab } from "../types/editor.types";
import styles from "../EditorPage.module.css";

interface InspectorPanelProps {
  state: EditorState;
  onUpdateClip: (clipId: string, updates: Partial<EditorClip>) => void;
  onSetTab: (tab: InspectorTab) => void;
}

const INSPECTOR_TABS: { id: InspectorTab; label: string }[] = [
  { id: "properties", label: "Props"   },
  { id: "effects",    label: "Efectos" },
  { id: "color",      label: "Color"   },
  { id: "audio",      label: "Audio"   },
];

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

export function InspectorPanel({ state, onUpdateClip, onSetTab }: InspectorPanelProps) {
  const { selection, project, activeInspectorTab } = state;

  const selectedClip: EditorClip | undefined = (() => {
    if (selection.clipIds.length === 0) return undefined;
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === selection.clipIds[0]);
      if (clip) return clip;
    }
    return undefined;
  })();

  return (
    <aside className={styles.rightPanel} aria-label="Inspector de propiedades">
      <div className={styles.inspectorHeader}>
        <p className={styles.inspectorTitle}>Inspector</p>
        <div className={styles.inspectorTabs} role="tablist">
          {INSPECTOR_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`inspector-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeInspectorTab === tab.id}
              className={`${styles.inspectorTab} ${activeInspectorTab === tab.id ? styles.inspectorTabActive : ""}`}
              onClick={() => onSetTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.inspectorContent} role="tabpanel" aria-labelledby={`inspector-tab-${activeInspectorTab}`}>
        {!selectedClip ? (
          <div className={styles.inspectorEmpty}>
            <div className={styles.inspectorEmptyIcon} aria-hidden="true">⬡</div>
            <p className={styles.inspectorEmptyText}>
              Selecciona un clip en el timeline para ver sus propiedades
            </p>
          </div>
        ) : (
          <>
            {activeInspectorTab === "properties" && (
              <PropertiesTab clip={selectedClip} onUpdate={onUpdateClip} />
            )}
            {activeInspectorTab === "effects" && (
              <EffectsTab clip={selectedClip} onUpdate={onUpdateClip} />
            )}
            {activeInspectorTab === "color" && (
              <ColorTab clip={selectedClip} onUpdate={onUpdateClip} />
            )}
            {activeInspectorTab === "audio" && (
              <AudioTab clip={selectedClip} onUpdate={onUpdateClip} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ─── Properties Tab ────────────────────────────────────────────────────────────

function PropertiesTab({
  clip,
  onUpdate,
}: {
  clip: EditorClip;
  onUpdate: (id: string, updates: Partial<EditorClip>) => void;
}) {
  const DEFAULT_TRANSFORM = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

  return (
    <>
      {/* ── Clip ── */}
      <div className={styles.propGroup}>
        <p className={styles.propGroupTitle}>Clip</p>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Nombre</span>
          <input
            type="text"
            className={styles.propInput}
            value={clip.name}
            style={{ width: "120px", textAlign: "left" }}
            aria-label="Nombre del clip"
            onChange={(e) => onUpdate(clip.id, { name: e.target.value })}
          />
        </div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Inicio</span>
          <span className={styles.propInput}>{clip.startTime.toFixed(2)}s</span>
        </div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Duración</span>
          <span className={styles.propInput}>{clip.duration.toFixed(2)}s</span>
        </div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Velocidad</span>
          <select
            className={styles.propInput}
            value={clip.speed}
            aria-label="Velocidad de reproducción"
            onChange={(e) => {
              const speed = parseFloat(e.target.value);
              // Recalculate duration when speed changes
              const originalDur = (clip.trimEnd - clip.trimStart);
              const newDuration = originalDur / speed;
              onUpdate(clip.id, { speed, duration: newDuration });
            }}
            style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)", border: "1px solid var(--glass-border)" }}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Transform ── */}
      <div className={styles.propGroup}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
          <p className={styles.propGroupTitle} style={{ margin: 0 }}>Transformación</p>
          <button
            type="button"
            className={styles.trackHeaderBtn}
            title="Restablecer transformación"
            onClick={() => onUpdate(clip.id, { transform: DEFAULT_TRANSFORM })}
            style={{ fontSize: "0.65rem", padding: "2px 6px" }}
          >
            Reset
          </button>
        </div>

        {(["x", "y"] as const).map((axis) => (
          <div key={axis} className={styles.propRow}>
            <span className={styles.propLabel}>Pos. {axis.toUpperCase()}</span>
            <input
              type="number"
              className={styles.propInput}
              value={clip.transform[axis]}
              aria-label={`Posición ${axis.toUpperCase()}`}
              onChange={(e) =>
                onUpdate(clip.id, { transform: { ...clip.transform, [axis]: parseFloat(e.target.value) || 0 } })
              }
            />
          </div>
        ))}

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Escala X</span>
          <input
            type="number"
            className={styles.propInput}
            min={0.01} max={10} step={0.01}
            value={clip.transform.scaleX}
            aria-label="Escala horizontal"
            onChange={(e) =>
              onUpdate(clip.id, { transform: { ...clip.transform, scaleX: parseFloat(e.target.value) || 1 } })
            }
          />
        </div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Escala Y</span>
          <input
            type="number"
            className={styles.propInput}
            min={0.01} max={10} step={0.01}
            value={clip.transform.scaleY}
            aria-label="Escala vertical"
            onChange={(e) =>
              onUpdate(clip.id, { transform: { ...clip.transform, scaleY: parseFloat(e.target.value) || 1 } })
            }
          />
        </div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Rotación</span>
          <input
            type="number"
            className={styles.propInput}
            min={-360} max={360}
            value={clip.transform.rotation}
            aria-label="Rotación en grados"
            onChange={(e) =>
              onUpdate(clip.id, { transform: { ...clip.transform, rotation: parseFloat(e.target.value) || 0 } })
            }
          />
        </div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>Opacidad</span>
          <input
            id={`inspector-opacity-${clip.id}`}
            type="range"
            className={styles.propSlider}
            min={0} max={1} step={0.01}
            value={clip.transform.opacity}
            aria-label="Opacidad"
            onChange={(e) =>
              onUpdate(clip.id, { transform: { ...clip.transform, opacity: parseFloat(e.target.value) } })
            }
          />
          <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", width: "28px", textAlign: "right" }}>
            {Math.round(clip.transform.opacity * 100)}%
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Effects Tab ───────────────────────────────────────────────────────────────

function EffectsTab({
  clip,
  onUpdate,
}: {
  clip: EditorClip;
  onUpdate: (id: string, updates: Partial<EditorClip>) => void;
}) {
  const EFFECTS = ["blur", "sharpen", "grayscale", "sepia", "vignette"] as const;

  return (
    <div className={styles.propGroup}>
      <p className={styles.propGroupTitle}>Efectos CSS</p>
      {EFFECTS.map((fx) => {
        const isActive = clip.effects.includes(fx);
        return (
          <div key={fx} className={styles.propRow}>
            <span className={styles.propLabel} style={{ textTransform: "capitalize" }}>{fx}</span>
            <button
              type="button"
              className={styles.trackHeaderBtn}
              style={{
                fontSize: "0.7rem",
                padding: "2px 8px",
                background: isActive ? "var(--color-accent)" : undefined,
                color: isActive ? "#fff" : undefined,
              }}
              onClick={() => {
                const newEffects = isActive
                  ? clip.effects.filter((e) => e !== fx)
                  : [...clip.effects, fx];
                onUpdate(clip.id, { effects: newEffects });
              }}
            >
              {isActive ? "ON" : "OFF"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Color Tab ─────────────────────────────────────────────────────────────────

function ColorTab({
  clip,
  onUpdate,
}: {
  clip: EditorClip;
  onUpdate: (id: string, updates: Partial<EditorClip>) => void;
}) {
  const colorProps: { key: keyof Pick<EditorClip["color"], "brightness" | "contrast" | "saturation" | "hue" | "temperature" | "tint">; label: string; min: number; max: number }[] = [
    { key: "brightness",  label: "Brillo",      min: -100, max: 100 },
    { key: "contrast",    label: "Contraste",   min: -100, max: 100 },
    { key: "saturation",  label: "Saturación",  min: -100, max: 100 },
    { key: "hue",         label: "Tono",        min: -180, max: 180 },
    { key: "temperature", label: "Temperatura", min: -100, max: 100 },
    { key: "tint",        label: "Tinte",       min: -100, max: 100 },
  ];

  return (
    <div className={styles.propGroup}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
        <p className={styles.propGroupTitle} style={{ margin: 0 }}>Ajustes de color</p>
        <button
          type="button"
          className={styles.trackHeaderBtn}
          style={{ fontSize: "0.65rem", padding: "2px 6px" }}
          onClick={() =>
            onUpdate(clip.id, {
              color: {
                brightness: 0,
                contrast: 0,
                saturation: 0,
                hue: 0,
                temperature: 0,
                tint: 0,
                lift: { y: 0, r: 0, g: 0, b: 0 },
                gamma: { y: 0, r: 0, g: 0, b: 0 },
                gain: { y: 0, r: 0, g: 0, b: 0 },
                offset: { y: 0, r: 0, g: 0, b: 0 },
                pivot: 0.5,
                contrastBias: 0,
              },
            })
          }
        >
          Reset
        </button>
      </div>
      {colorProps.map(({ key, label, min, max }) => {
        const numericValue = typeof clip.color[key] === "number" ? Number(clip.color[key]) : 0;
        return (
          <div key={key} className={styles.propRow}>
            <span className={styles.propLabel}>{label}</span>
            <input
              id={`inspector-color-${key}-${clip.id}`}
              type="range"
              className={styles.propSlider}
              min={min} max={max} step={1}
              value={numericValue}
              aria-label={label}
              onChange={(e) =>
                onUpdate(clip.id, { color: { ...clip.color, [key]: parseFloat(e.target.value) } })
              }
            />
            <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", width: "30px", textAlign: "right" }}>
              {numericValue > 0 ? `+${numericValue}` : numericValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Audio Tab ─────────────────────────────────────────────────────────────────

function AudioTab({
  clip,
  onUpdate,
}: {
  clip: EditorClip;
  onUpdate: (id: string, updates: Partial<EditorClip>) => void;
}) {
  return (
    <div className={styles.propGroup}>
      <p className={styles.propGroupTitle}>Audio del clip</p>

      <div className={styles.propRow}>
        <span className={styles.propLabel}>Volumen</span>
        <input
          id={`inspector-volume-${clip.id}`}
          type="range"
          className={styles.propSlider}
          min={0} max={2} step={0.01}
          value={clip.audio.volume}
          aria-label="Volumen del clip"
          onChange={(e) =>
            onUpdate(clip.id, { audio: { ...clip.audio, volume: parseFloat(e.target.value) } })
          }
        />
        <span style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", width: "28px", textAlign: "right" }}>
          {Math.round(clip.audio.volume * 100)}%
        </span>
      </div>

      <div className={styles.propRow}>
        <span className={styles.propLabel}>Silenciar</span>
        <input
          id={`inspector-mute-${clip.id}`}
          type="checkbox"
          checked={clip.audio.muted}
          aria-label="Silenciar clip"
          onChange={(e) =>
            onUpdate(clip.id, { audio: { ...clip.audio, muted: e.target.checked } })
          }
        />
      </div>
    </div>
  );
}
