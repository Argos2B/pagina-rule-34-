/**
 * Timeline — Professional timeline with:
 * - Time ruler with tick marks
 * - Animated playhead
 * - Track headers (name, mute, lock, visibility controls)
 * - Clip blocks with real trim handles (left/right drag)
 * - Clip horizontal drag (move)
 * - Drag & drop from MediaPanel
 * - Horizontal scroll + zoom
 * - Click-to-seek on ruler
 * - Format Selector integrated in toolbar (NOT in preview, NOT as a separate panel)
 */

import React, { useRef, useMemo, useState, useEffect, useCallback } from "react";
import type {
  EditorProject,
  EditorPlaybackState,
  TimelineState,
  EditorTrack,
  EditorClip,
} from "../types/editor.types";
import styles from "../EditorPage.module.css";

interface TimelineProps {
  project: EditorProject;
  playback: EditorPlaybackState;
  timeline: TimelineState;
  onSelectClip: (clipId: string, multiSelect?: boolean) => void;
  onClearSelection: () => void;
  onSeek: (time: number) => void;
  onSetScale: (scale: number) => void;
  onSetScroll: (scroll: number) => void;
  onUpdateTrack: (trackId: string, updates: Partial<EditorTrack>) => void;
  onAddTrack: () => void;
  onAddClip?: (trackId: string, clip: EditorClip) => void;
  onMoveClip?: (clipId: string, newStartTime: number) => void;
  onTrimClip?: (
    clipId: string,
    updates: { startTime?: number; duration?: number; trimStart?: number; trimEnd?: number }
  ) => void;
  onUpdateProjectSettings?: (updates: Partial<EditorProject["settings"]>) => void;
}

// ─── Format Presets ────────────────────────────────────────────────────────────

interface FormatPreset {
  group: string;
  name: string;
  width: number;
  height: number;
  ratio: string;
}

const FORMAT_PRESETS: FormatPreset[] = [
  { group: "Social", name: "TikTok",          width: 1080, height: 1920, ratio: "9:16" },
  { group: "Social", name: "Instagram Reels", width: 1080, height: 1920, ratio: "9:16" },
  { group: "Social", name: "YouTube Shorts",  width: 1080, height: 1920, ratio: "9:16" },
  { group: "Social", name: "Instagram",       width: 1080, height: 1350, ratio: "4:5"  },
  { group: "Social", name: "YouTube",         width: 1920, height: 1080, ratio: "16:9" },

  { group: "Canvas", name: "Landscape 16:9",  width: 1920, height: 1080, ratio: "16:9" },
  { group: "Canvas", name: "Vertical 9:16",   width: 1080, height: 1920, ratio: "9:16" },
  { group: "Canvas", name: "Square 1:1",      width: 1080, height: 1080, ratio: "1:1"  },
  { group: "Canvas", name: "Portrait 4:5",    width: 1080, height: 1350, ratio: "4:5"  },
  { group: "Canvas", name: "Classic 4:3",     width: 1440, height: 1080, ratio: "4:3"  },

  { group: "Facebook", name: "Landscape",     width: 1920, height: 1080, ratio: "16:9" },
  { group: "Facebook", name: "Square",        width: 1080, height: 1080, ratio: "1:1"  },
  { group: "Facebook", name: "Portrait",      width: 1080, height: 1350, ratio: "4:5"  },
  { group: "Facebook", name: "Reels",         width: 1080, height: 1920, ratio: "9:16" },
  { group: "Facebook", name: "Stories",       width: 1080, height: 1920, ratio: "9:16" },

  { group: "X", name: "Landscape",            width: 1920, height: 1080, ratio: "16:9" },
  { group: "X", name: "Square",               width: 1080, height: 1080, ratio: "1:1"  },
  { group: "X", name: "Portrait",             width: 1080, height: 1350, ratio: "4:5"  },

  { group: "LinkedIn", name: "Landscape",     width: 1920, height: 1080, ratio: "16:9" },
  { group: "LinkedIn", name: "Square",        width: 1080, height: 1080, ratio: "1:1"  },
  { group: "LinkedIn", name: "Portrait",      width: 1080, height: 1350, ratio: "4:5"  },

  { group: "Snapchat", name: "Story",         width: 1080, height: 1920, ratio: "9:16" },
  { group: "Pinterest", name: "Standard",     width: 1000, height: 1500, ratio: "2:3"  },
  { group: "Pinterest", name: "Square",       width: 1080, height: 1080, ratio: "1:1"  },
  { group: "Pinterest", name: "Idea Pin",     width: 1080, height: 1920, ratio: "9:16" },
  { group: "Twitch", name: "Video",           width: 1920, height: 1080, ratio: "16:9" },
  { group: "Twitch", name: "Vertical Clip",   width: 1080, height: 1920, ratio: "9:16" },
  { group: "Threads", name: "Vertical",       width: 1080, height: 1920, ratio: "9:16" },
  { group: "Threads", name: "Square",         width: 1080, height: 1080, ratio: "1:1"  },
  { group: "WhatsApp", name: "Status",        width: 1080, height: 1920, ratio: "9:16" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function calcRatio(w: number, h: number): string {
  if (!w || !h) return "";
  const d = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w) / d}:${Math.round(h) / d}`;
}

function timeToX(time: number, scale: number): number {
  return time * scale;
}

function generateRulerMarks(
  duration: number,
  scale: number,
  containerWidth: number
): { time: number; isMajor: boolean }[] {
  const visibleDuration = Math.max(duration, containerWidth / scale);
  let interval = 1;
  if (scale < 20) interval = 10;
  else if (scale < 40) interval = 5;
  else if (scale < 80) interval = 2;

  const marks: { time: number; isMajor: boolean }[] = [];
  const end = Math.ceil(visibleDuration);
  for (let t = 0; t <= end; t += interval / 4) {
    marks.push({ time: t, isMajor: t % interval === 0 });
  }
  return marks;
}

function formatRulerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
  return `${s}s`;
}

const CLIP_TYPE_CLASS: Record<EditorClip["type"], string> = {
  video:      styles.clipVideo,
  audio:      styles.clipAudio,
  image:      styles.clipImage,
  text:       styles.clipText,
  transition: styles.clipVideo,
  effect:     styles.clipVideo,
};

const TRACK_TYPE_CLASS: Record<EditorTrack["type"], string> = {
  video:  styles.trackTypeVideo,
  audio:  styles.trackTypeAudio,
  text:   styles.trackTypeText,
  effect: styles.trackTypeEffect,
};

const createDefaultClipColor = () => ({
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
});

// ─── Format Selector ──────────────────────────────────────────────────────────

interface FormatSelectorProps {
  settings: EditorProject["settings"];
  onUpdateSettings?: (updates: Partial<EditorProject["settings"]>) => void;
}

function FormatSelector({ settings, onUpdateSettings }: FormatSelectorProps) {
  const [isOpen, setIsOpen]           = useState(false);
  const [search, setSearch]           = useState("");
  const [customW, setCustomW]         = useState(String(settings.width));
  const [customH, setCustomH]         = useState(String(settings.height));
  const [safeAreas, setSafeAreas]     = useState(
    () => (settings as any).safeAreas ?? false
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Sync custom inputs when settings change externally
  useEffect(() => {
    setCustomW(String(settings.width));
    setCustomH(String(settings.height));
    setSafeAreas(settings.safeAreas ?? false);
  }, [settings.height, settings.safeAreas, settings.width]);

  const handleSelectPreset = useCallback((preset: FormatPreset) => {
    if (onUpdateSettings) {
      onUpdateSettings({
        width:       preset.width,
        height:      preset.height,
        ...(safeAreas !== undefined ? { safeAreas } : {}),
      });
    }
    setIsOpen(false);
    setSearch("");
  }, [onUpdateSettings, safeAreas]);

  const handleApplyCustom = useCallback(() => {
    const w = parseInt(customW, 10);
    const h = parseInt(customH, 10);
    if (!w || !h || w < 1 || h < 1) return;
    const ratio = calcRatio(w, h);
    if (onUpdateSettings) {
      onUpdateSettings({ width: w, height: h, aspectRatio: ratio });
    }
    setIsOpen(false);
    setSearch("");
  }, [customW, customH, onUpdateSettings]);

  const handleToggleSafeAreas = useCallback((checked: boolean) => {
    setSafeAreas(checked);
    if (onUpdateSettings) {
      onUpdateSettings({ safeAreas: checked });
    }
  }, [onUpdateSettings]);

  // Identify current preset
  const currentPreset = FORMAT_PRESETS.find(
    (p) => p.width === settings.width && p.height === settings.height && p.ratio === settings.aspectRatio
  ) ?? FORMAT_PRESETS.find(
    (p) => p.width === settings.width && p.height === settings.height
  );

  // Button label — compact but informative
  const btnLabel = currentPreset
    ? `${currentPreset.group} · ${settings.width}×${settings.height} · ${currentPreset.ratio}`
    : `${settings.width}×${settings.height} · ${settings.aspectRatio || calcRatio(settings.width, settings.height)}`;

  // Filter presets by search
  const lowerSearch = search.toLowerCase();
  const filteredPresets = lowerSearch
    ? FORMAT_PRESETS.filter(
        (p) =>
          p.group.toLowerCase().includes(lowerSearch) ||
          p.name.toLowerCase().includes(lowerSearch) ||
          p.ratio.includes(lowerSearch)
      )
    : FORMAT_PRESETS;

  // Group filtered presets
  const groups = useMemo(() => {
    const map = new Map<string, FormatPreset[]>();
    for (const p of filteredPresets) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return Array.from(map.entries());
  }, [filteredPresets]);

  // Custom ratio preview
  const customRatioPreview = useMemo(() => {
    const w = parseInt(customW, 10);
    const h = parseInt(customH, 10);
    if (!w || !h) return "";
    return calcRatio(w, h);
  }, [customW, customH]);

  return (
    <div className={styles.fmtContainer} ref={containerRef}>
      <button
        id="timeline-format-selector"
        type="button"
        className={`${styles.fmtBtn} ${isOpen ? styles.fmtBtnActive : ""}`}
        onClick={() => setIsOpen((v) => !v)}
        title="Project Format"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <svg
          className={styles.fmtBtnIcon}
          width="11" height="11"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          <line x1="1" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="0.8"/>
          <line x1="1" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="0.8"/>
          <line x1="4" y1="1" x2="4" y2="11" stroke="currentColor" strokeWidth="0.8"/>
        </svg>
        <span className={styles.fmtBtnLabel}>{btnLabel}</span>
        <span className={styles.fmtCaret}>▾</span>
      </button>

      {isOpen && (
        <div
          className={styles.fmtPopover}
          role="listbox"
          aria-label="Project format selector"
        >
          {/* Header */}
          <div className={styles.fmtPopoverHead}>
            <span className={styles.fmtPopoverTitle}>Project Format</span>
            <button
              type="button"
              className={styles.fmtPopoverClose}
              onClick={() => { setIsOpen(false); setSearch(""); }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Search */}
          <div className={styles.fmtSearch}>
            <input
              type="text"
              className={styles.fmtSearchInput}
              placeholder="Search formats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              spellCheck={false}
            />
          </div>

          {/* Preset list */}
          <div className={styles.fmtList}>
            {groups.length === 0 && (
              <div style={{ padding: "0.6rem 0.65rem", fontSize: "0.62rem", color: "var(--ed-text-2)" }}>
                No formats found
              </div>
            )}
            {groups.map(([groupName, presets]) => (
              <React.Fragment key={groupName}>
                <div className={styles.fmtGroup}>{groupName}</div>
                {presets.map((preset, i) => {
                  const isActive =
                    settings.width === preset.width &&
                    settings.height === preset.height &&
                    (settings.aspectRatio === preset.ratio || !settings.aspectRatio);
                  return (
                    <button
                      key={`${groupName}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`${styles.fmtOption} ${isActive ? styles.fmtOptionActive : ""}`}
                      onClick={() => handleSelectPreset(preset)}
                    >
                      <span className={styles.fmtOptionName}>{preset.name}</span>
                      <span className={styles.fmtOptionDim}>{preset.width}×{preset.height}</span>
                      <span className={styles.fmtOptionCheck}>{isActive ? "●" : ""}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Safe Areas toggle */}
          <div className={styles.fmtSafeAreas}>
            <input
              id="fmt-safe-areas"
              type="checkbox"
              className={styles.fmtSafeAreasCheck}
              checked={safeAreas}
              onChange={(e) => handleToggleSafeAreas(e.target.checked)}
            />
            <label htmlFor="fmt-safe-areas" className={styles.fmtSafeAreasLabel}>
              Safe Areas
            </label>
          </div>

          {/* Custom dimensions */}
          <div className={styles.fmtCustom}>
            <div className={styles.fmtCustomTitle}>Custom</div>
            <div className={styles.fmtCustomRow}>
              <input
                type="number"
                className={styles.fmtCustomInput}
                value={customW}
                min={1}
                max={7680}
                placeholder="W"
                onChange={(e) => setCustomW(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleApplyCustom(); }}
                aria-label="Custom width"
              />
              <span className={styles.fmtCustomSep}>×</span>
              <input
                type="number"
                className={styles.fmtCustomInput}
                value={customH}
                min={1}
                max={7680}
                placeholder="H"
                onChange={(e) => setCustomH(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleApplyCustom(); }}
                aria-label="Custom height"
              />
              <span className={styles.fmtCustomRatio}>{customRatioPreview}</span>
            </div>
            <button
              type="button"
              className={styles.fmtCustomApplyBtn}
              onClick={handleApplyCustom}
            >
              Apply Custom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export function Timeline({
  project,
  playback,
  timeline,
  onSelectClip,
  onClearSelection,
  onSeek,
  onSetScale,
  onSetScroll,
  onUpdateTrack,
  onAddTrack,
  onAddClip,
  onMoveClip,
  onTrimClip,
  onUpdateProjectSettings,
}: TimelineProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rulerRef  = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<"select" | "cut" | "hand" | "zoom" | "snap" | "trim">("select");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const { scale, minScale, maxScale } = timeline;
  const totalWidth = Math.max(project.settings.duration * scale + 200, 800);
  const playheadX  = timeToX(playback.currentTime, scale);

  const rulerMarks = useMemo(
    () => generateRulerMarks(project.settings.duration, scale, 800),
    [project.settings.duration, scale]
  );

  const toolButtons = [
    { key: "select", label: "Selection", shortcut: "V", icon: "V" },
    { key: "cut",    label: "Split",     shortcut: "C", icon: "C" },
    { key: "hand",   label: "Hand",      shortcut: "H", icon: "H" },
    { key: "zoom",   label: "Zoom",      shortcut: "Z", icon: "Z" },
    { key: "trim",   label: "Trim",      shortcut: "T", icon: "T" },
  ] as const;

  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x    = e.clientX - rect.left + (canvasRef.current?.scrollLeft ?? 0);
    onSeek(Math.max(0, Math.min(x / scale, project.settings.duration)));
  }

  function handleClipClick(e: React.MouseEvent, clipId: string) {
    e.stopPropagation();
    onSelectClip(clipId, e.ctrlKey || e.metaKey);
  }

  function zoomIn()    { onSetScale(Math.min(scale * 1.4, maxScale)); }
  function zoomOut()   { onSetScale(Math.max(scale / 1.4, minScale)); }
  function zoomReset() { onSetScale(60); }

  function handleDropOnTrack(e: React.DragEvent, trackId: string) {
    e.preventDefault();
    if (!onAddClip) return;

    try {
      const data = e.dataTransfer.getData("application/json");
      if (!data) return;
      const asset = JSON.parse(data);

      const rect = e.currentTarget.getBoundingClientRect();
      const x    = e.clientX - rect.left + (canvasRef.current?.scrollLeft ?? 0);
      const time = Math.max(0, x / scale);

      const dur = asset.duration ?? 5;
      const clip: EditorClip = {
        id: crypto.randomUUID(),
        trackId,
        assetId: asset.id,
        name: asset.name,
        type: asset.type,
        startTime: time,
        duration: dur,
        trimStart: 0,
        trimEnd: dur,
        speed: 1,
        selected: false,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        audio: { volume: 1, muted: false, pan: 0 },
        effects: [],
        color: createDefaultClipColor(),
      };
      onAddClip(trackId, clip);
    } catch (err) {
      console.error("Error dropping asset:", err);
    }
  }

  const zoomPercent = Math.round(((scale - minScale) / (maxScale - minScale)) * 100);

  return (
    <section className={styles.timelineWrapper} aria-label="Timeline del proyecto">
      <div className={styles.timelineToolbar}>
        {/* ── Left: editing tools + snap ── */}
        <div className={styles.timelineToolbarLeft}>
          <div className={styles.timelineToolGroup} aria-label="Herramientas de edición">
            {toolButtons.map((tool) => (
              <button
                key={tool.key}
                type="button"
                className={`${styles.timelineToolButton} ${activeTool === tool.key ? styles.timelineToolButtonActive : ""}`}
                title={`${tool.label} (${tool.shortcut})`}
                onClick={() => setActiveTool(tool.key)}
              >
                <span>{tool.icon}</span>
              </button>
            ))}
          </div>

          <div className={styles.timelineDivider} />

          <button
            type="button"
            className={`${styles.snapToggle} ${snapEnabled ? styles.snapToggleActive : ""}`}
            onClick={() => setSnapEnabled((enabled) => !enabled)}
            title="Snap"
          >
            SNAP
          </button>
        </div>

        {/* ── Right: TC + zoom + format selector + add track ── */}
        <div className={styles.timelineToolbarRight}>
          <div className={styles.timelineStatusGroup}>
            <span className={styles.timelineStatusLabel}>TC</span>
            <span className={styles.timelineStatusValue}>{formatRulerTime(playback.currentTime)}</span>
          </div>

          <div className={styles.timelineZoom}>
            <button id="timeline-zoom-out" type="button" className={styles.zoomBtn} onClick={zoomOut} disabled={scale <= minScale}>−</button>
            <button
              type="button"
              className={styles.timelineZoomLabel}
              onClick={zoomReset}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ed-text-2)" }}
            >
              {zoomPercent}%
            </button>
            <button id="timeline-zoom-in" type="button" className={styles.zoomBtn} onClick={zoomIn} disabled={scale >= maxScale}>+</button>
          </div>

          {/* ── FORMAT SELECTOR — integrated in the toolbar ── */}
          <FormatSelector
            settings={project.settings}
            onUpdateSettings={onUpdateProjectSettings}
          />

          <div className={styles.timelineDivider} />

          <button id="timeline-add-track" type="button" className={styles.addTrackBtn} onClick={onAddTrack}>
            + Track
          </button>
        </div>
      </div>

      <div className={styles.timelineBody}>
        {/* Track headers */}
        <div className={styles.trackHeaders}>
          <div className={styles.trackHeaderSpacer} />
          {project.tracks.map((track) => (
            <div
              key={track.id}
              className={`${styles.trackHeaderItem} ${track.muted ? styles.trackMuted : ""}`}
              style={{ height: track.height, minHeight: track.height }}
            >
              <div className={`${styles.trackTypeIndicator} ${TRACK_TYPE_CLASS[track.type]}`} style={{ height: "22px" }} />
              <span className={styles.trackHeaderName} title={track.name}>{track.name}</span>
              <div className={styles.trackHeaderBtns}>
                {/* Lock icon */}
                <button
                  type="button"
                  className={styles.trackHeaderBtn}
                  title={track.locked ? "Desbloquear" : "Bloquear"}
                  onClick={() => onUpdateTrack(track.id, { locked: !track.locked })}
                  style={{ opacity: track.locked ? 0.75 : 0.35, color: track.locked ? "#aab0c0" : "#606070" }}
                >
                  {track.locked ? (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" opacity="0.9"/>
                      <path d="M4 5.5V3.5C4 2.12 4.9 1 6 1s2 1.12 2 2.5V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" opacity="0.6"/>
                      <path d="M4 5.5V3.5C4 2.12 4.9 1 6 1s2 1.12 2 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.5"/>
                    </svg>
                  )}
                </button>
                {/* Visibility icon */}
                <button
                  type="button"
                  className={styles.trackHeaderBtn}
                  title={track.visible ? "Ocultar" : "Mostrar"}
                  onClick={() => onUpdateTrack(track.id, { visible: !track.visible })}
                  style={{ opacity: track.visible ? 0.45 : 0.7, color: track.visible ? "#606070" : "#9090a0" }}
                >
                  {track.visible ? (
                    <svg width="11" height="8" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                      <path d="M7 1C4 1 1.5 3.5 1.5 5S4 9 7 9s5.5-2.5 5.5-4S10 1 7 1Z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                      <circle cx="7" cy="5" r="1.8" fill="currentColor"/>
                    </svg>
                  ) : (
                    <svg width="11" height="8" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                      <path d="M7 1C4 1 1.5 3.5 1.5 5S4 9 7 9s5.5-2.5 5.5-4S10 1 7 1Z" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.4"/>
                      <line x1="2" y1="2" x2="12" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
                {/* Mute icon for audio tracks */}
                {track.type === "audio" && (
                  <button
                    type="button"
                    className={styles.trackHeaderBtn}
                    title={track.muted ? "Activar audio" : "Silenciar"}
                    onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                    style={{ opacity: track.muted ? 0.7 : 0.4, color: track.muted ? "#9090a0" : "#606070" }}
                  >
                    {track.muted ? (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <polygon points="1,4 4,4 7,2 7,10 4,8 1,8" fill="currentColor" opacity="0.7"/>
                        <line x1="9" y1="4" x2="11" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <line x1="11" y1="4" x2="9" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <polygon points="1,4 4,4 7,2 7,10 4,8 1,8" fill="currentColor" opacity="0.6"/>
                        <path d="M9 4.5c.5.3.8.8.8 1.5s-.3 1.2-.8 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable canvas */}
        <div
          ref={canvasRef}
          className={styles.timelineCanvas}
          id="timeline-canvas"
          onScroll={(e) => {
            if (rulerRef.current) {
              rulerRef.current.style.transform = `translateX(-${e.currentTarget.scrollLeft}px)`;
            }
            onSetScroll(e.currentTarget.scrollLeft);
          }}
        >
          <div className={styles.timelineCanvasInner} style={{ width: totalWidth }}>
            {/* Ruler */}
            <div
              ref={rulerRef}
              className={styles.timelineRuler}
              onClick={handleRulerClick}
              style={{ width: totalWidth }}
            >
              {rulerMarks.map(({ time, isMajor }) => (
                <div key={time} className={styles.rulerMark} style={{ left: timeToX(time, scale) }}>
                  <div className={styles.rulerLine} style={{ height: isMajor ? 14 : 7 }} />
                  {isMajor && <span className={styles.rulerLabel}>{formatRulerTime(time)}</span>}
                </div>
              ))}
              <div className={styles.playheadLine} style={{ left: playheadX }}>
                <div className={styles.playheadHead} />
              </div>
            </div>

            {/* Track rows */}
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className={styles.trackRow}
                style={{ height: track.height, minHeight: track.height }}
              >
                <div
                  className={styles.trackRowInner}
                  style={{ width: totalWidth, position: "relative" }}
                  onClick={onClearSelection}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropOnTrack(e, track.id)}
                >
                  {track.clips.map((clip) => (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      scale={scale}
                      trackHeight={track.height}
                      onClickClip={handleClipClick}
                      onMoveClip={onMoveClip}
                      onTrimClip={onTrimClip}
                    />
                  ))}
                  <div className={styles.playheadLine} style={{ left: playheadX }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.timelineFooterBar}>
        <div className={styles.timelineFooterLeft}>
          <span>Zoom {zoomPercent}%</span>
          <span>Duration {project.settings.duration.toFixed(1)}s</span>
          <span>Playhead {formatRulerTime(playback.currentTime)}</span>
        </div>
        <div className={styles.timelineFooterRight}>
          <span>{snapEnabled ? "Snap on" : "Snap off"}</span>
          <span style={{ color: "var(--ed-text-2)" }}>
            {project.settings.width}×{project.settings.height} · {project.settings.aspectRatio}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── Clip Block with trim handles and move drag ────────────────────────────────

interface ClipBlockProps {
  clip: EditorClip;
  scale: number;
  trackHeight: number;
  onClickClip: (e: React.MouseEvent, clipId: string) => void;
  onMoveClip?: (clipId: string, newStartTime: number) => void;
  onTrimClip?: (
    clipId: string,
    updates: { startTime?: number; duration?: number; trimStart?: number; trimEnd?: number }
  ) => void;
}

function ClipBlock({ clip, scale, onClickClip, onMoveClip, onTrimClip }: ClipBlockProps) {
  const left  = timeToX(clip.startTime, scale);
  const width = Math.max(clip.duration * scale - 2, 8);

  // Waveform bars for audio clips
  const waveformBars = useMemo(() => {
    if (clip.type !== "audio") return [];
    const count = Math.floor(width / 3);
    return Array.from({ length: count }, (_, i) => {
      const seed = (clip.id.charCodeAt(i % clip.id.length) + i * 7) % 100;
      return Math.max(4, (seed / 100) * 28);
    });
  }, [clip.type, width, clip.id]);

  // ── Move drag ────────────────────────────────────────────────────────────────
  function handleBodyMouseDown(e: React.MouseEvent) {
    if (!onMoveClip) return;
    if ((e.target as HTMLElement).dataset.handle) return;

    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const origStart = clip.startTime;

    function onMouseMove(me: MouseEvent) {
      const dx    = me.clientX - startX;
      const delta = dx / scale;
      onMoveClip!(clip.id, Math.max(0, origStart + delta));
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // ── Left trim handle ─────────────────────────────────────────────────────────
  function handleLeftTrimMouseDown(e: React.MouseEvent) {
    if (!onTrimClip) return;
    e.stopPropagation();
    e.preventDefault();

    const startX        = e.clientX;
    const origStart     = clip.startTime;
    const origDuration  = clip.duration;
    const origTrimStart = clip.trimStart;

    function onMouseMove(me: MouseEvent) {
      const dx          = me.clientX - startX;
      const delta       = dx / scale;
      const newStart    = Math.max(0, origStart + delta);
      const newDuration = origDuration - (newStart - origStart);
      if (newDuration < 0.1) return;
      const newTrimStart = Math.max(0, origTrimStart + delta * clip.speed);
      onTrimClip!(clip.id, { startTime: newStart, duration: newDuration, trimStart: newTrimStart });
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // ── Right trim handle ────────────────────────────────────────────────────────
  function handleRightTrimMouseDown(e: React.MouseEvent) {
    if (!onTrimClip) return;
    e.stopPropagation();
    e.preventDefault();

    const startX       = e.clientX;
    const origDuration = clip.duration;
    const origTrimEnd  = clip.trimEnd;

    function onMouseMove(me: MouseEvent) {
      const dx          = me.clientX - startX;
      const delta       = dx / scale;
      const newDuration = Math.max(0.1, origDuration + delta);
      const newTrimEnd  = Math.max(clip.trimStart + 0.1, origTrimEnd + delta * clip.speed);
      onTrimClip!(clip.id, { duration: newDuration, trimEnd: newTrimEnd });
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      id={`clip-${clip.id}`}
      className={`${styles.clip} ${CLIP_TYPE_CLASS[clip.type]} ${clip.selected ? styles.clipSelected : ""}`}
      style={{ left, width, cursor: "grab" }}
      role="button"
      tabIndex={0}
      aria-label={`Clip: ${clip.name}`}
      aria-pressed={clip.selected}
      title={`${clip.name} (${clip.startTime.toFixed(1)}s – ${(clip.startTime + clip.duration).toFixed(1)}s)`}
      onClick={(e) => onClickClip(e, clip.id)}
      onMouseDown={handleBodyMouseDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClickClip(e as unknown as React.MouseEvent, clip.id);
        }
      }}
    >
      {/* Left trim handle */}
      <div
        data-handle="left"
        style={{
          position: "absolute",
          left: 0, top: 0, bottom: 0,
          width: 8,
          cursor: "ew-resize",
          background: "rgba(255,255,255,0.25)",
          borderRight: "2px solid rgba(255,255,255,0.6)",
          zIndex: 2,
        }}
        onMouseDown={handleLeftTrimMouseDown}
      />

      {/* Right trim handle */}
      <div
        data-handle="right"
        style={{
          position: "absolute",
          right: 0, top: 0, bottom: 0,
          width: 8,
          cursor: "ew-resize",
          background: "rgba(255,255,255,0.25)",
          borderLeft: "2px solid rgba(255,255,255,0.6)",
          zIndex: 2,
        }}
        onMouseDown={handleRightTrimMouseDown}
      />

      {/* Waveform for audio */}
      {clip.type === "audio" && (
        <div className={styles.clipWaveform} aria-hidden="true">
          {waveformBars.map((h, i) => (
            <div key={i} className={styles.waveBar} style={{ height: h }} />
          ))}
        </div>
      )}

      <span className={styles.clipLabel}>{clip.name}</span>
    </div>
  );
}
