import { useMemo, useRef, useState } from "react";
import type { EditorClip } from "../types/editor.types";
import styles from "../EditorPage.module.css";

type WheelKey = "lift" | "gamma" | "gain" | "offset";
type CurveChannel = "Master" | "Red" | "Green" | "Blue";
type ToneGroup = { y: number; r: number; g: number; b: number };
type WheelValue = { x: number; y: number };

const defaultTone: ToneGroup = { y: 0, r: 0, g: 0, b: 0 };
const emptyClipColor: EditorClip["color"] = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  lift: { ...defaultTone },
  gamma: { ...defaultTone },
  gain: { ...defaultTone },
  offset: { ...defaultTone },
  pivot: 0.5,
  contrastBias: 0,
};

const defaultWheels: Record<WheelKey, WheelValue> = {
  lift: { x: 0.12, y: 0.18 },
  gamma: { x: 0.18, y: -0.08 },
  gain: { x: 0.32, y: 0.2 },
  offset: { x: -0.14, y: 0.12 },
};

const presetMap = {
  Neutral: { ...defaultWheels },
  Cinematic: {
    lift: { x: 0.2, y: 0.26 },
    gamma: { x: 0.24, y: -0.1 },
    gain: { x: 0.36, y: 0.18 },
    offset: { x: 0.08, y: 0.12 },
  },
  Warm: {
    lift: { x: 0.28, y: 0.34 },
    gamma: { x: 0.24, y: -0.04 },
    gain: { x: 0.42, y: 0.22 },
    offset: { x: 0.14, y: 0.16 },
  },
  Cool: {
    lift: { x: -0.22, y: -0.08 },
    gamma: { x: -0.12, y: 0.08 },
    gain: { x: -0.2, y: 0.1 },
    offset: { x: -0.18, y: -0.12 },
  },
  "High Contrast": {
    lift: { x: -0.1, y: 0.12 },
    gamma: { x: 0.1, y: -0.2 },
    gain: { x: 0.52, y: 0.2 },
    offset: { x: 0.12, y: 0.06 },
  },
  Film: {
    lift: { x: 0.08, y: 0.22 },
    gamma: { x: 0.1, y: -0.1 },
    gain: { x: 0.38, y: 0.16 },
    offset: { x: 0.08, y: 0.06 },
  },
  "B&W": {
    lift: { x: 0.04, y: 0.04 },
    gamma: { x: 0.12, y: -0.02 },
    gain: { x: 0.18, y: 0.04 },
    offset: { x: 0.0, y: 0.0 },
  },
} as const;

const presets = Object.keys(presetMap) as Array<keyof typeof presetMap>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}



function toneToWheelValue(tone: ToneGroup): WheelValue {
  const x = clamp((tone.r - tone.g) / 200 + (tone.b / 300) * 0.8, -1, 1);
  const y = clamp((tone.y / 180) - (tone.b / 260) + (tone.g - tone.r) / 360, -1, 1);
  return { x, y };
}

function wheelValueToTone(value: WheelValue): ToneGroup {
  return {
    y: clamp(value.y * 100, -100, 100),
    r: clamp(value.x * 100 + 25, -100, 100),
    g: clamp(-value.x * 120 + 10, -100, 100),
    b: clamp(value.y * 90 - value.x * 35, -100, 100),
  };
}

function ColorWheel({
  label,
  tone,
  onChange,
}: {
  label: string;
  tone: ToneGroup;
  onChange: (next: ToneGroup) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const value = toneToWheelValue(tone);

  const handlePointer = (clientX: number, clientY: number) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const normalizedX = ((clientX - rect.left) / rect.width - 0.5) * 2;
    const normalizedY = ((clientY - rect.top) / rect.height - 0.5) * 2;
    const dist = Math.sqrt(normalizedX ** 2 + normalizedY ** 2);
    const scale = dist > 1 ? 1 / dist : 1;
    const nextX = clamp(normalizedX * scale, -1, 1);
    const nextY = clamp(normalizedY * scale, -1, 1);
    onChange(wheelValueToTone({ x: nextX, y: nextY }));
  };

  const markerLeft = `${50 + value.x * 42}%`;
  const markerTop  = `${50 + value.y * 42}%`;
  const isModified = Math.abs(value.x) > 0.02 || Math.abs(value.y) > 0.02;

  return (
    <div className={styles.colorWheelCard}>
      {/* Label + tiny numeric */}
      <div className={styles.colorWheelHeader}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        {isModified && (
          <small style={{ opacity: 0.5, fontVariantNumeric: "tabular-nums" }}>
            {(value.x >= 0 ? "+" : "") + value.x.toFixed(2)}&thinsp;
            {(value.y >= 0 ? "+" : "") + value.y.toFixed(2)}
          </small>
        )}
      </div>

      {/* The wheel itself */}
      <div
        ref={ref}
        className={styles.colorWheel}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          handlePointer(event.clientX, event.clientY);
        }}
        title={`${label}: arrastra para ajustar color`}
      >
        {/* Chromatic ring */}
        <div className={styles.colorWheelInner} />
        {/* Center dot / marker */}
        <div
          className={styles.colorWheelMarker}
          style={{ left: markerLeft, top: markerTop }}
        />
      </div>

      {/* Y R G B values + reset */}
      <div className={styles.wheelValueGrid}>
        <button type="button" className={styles.wheelReset} onClick={() => onChange({ y: 0, r: 0, g: 0, b: 0 })}>
          Rst
        </button>
        <div className={styles.wheelValueMeta}>
          <span>Y {tone.y.toFixed(0)}</span>
          <span>R {tone.r.toFixed(0)}</span>
          <span>G {tone.g.toFixed(0)}</span>
          <span>B {tone.b.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}

function CurvesPanel() {
  const [points, setPoints] = useState<Record<CurveChannel, Array<{ x: number; y: number }>>>({
    Master: [
      { x: 0, y: 100 },
      { x: 26, y: 72 },
      { x: 56, y: 28 },
      { x: 100, y: 0 },
    ],
    Red: [
      { x: 0, y: 100 },
      { x: 34, y: 62 },
      { x: 72, y: 42 },
      { x: 100, y: 0 },
    ],
    Green: [
      { x: 0, y: 100 },
      { x: 30, y: 50 },
      { x: 70, y: 20 },
      { x: 100, y: 0 },
    ],
    Blue: [
      { x: 0, y: 100 },
      { x: 40, y: 54 },
      { x: 77, y: 24 },
      { x: 100, y: 0 },
    ],
  });

  const activeChannels: CurveChannel[] = ["Master", "Red", "Green", "Blue"];
  const draggingRef = useRef<{ channel: CurveChannel; index: number } | null>(null);

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>, channel: CurveChannel) => {
    if (!draggingRef.current || draggingRef.current.channel !== channel) return;
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(100 - ((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    setPoints((current) => {
      const next = [...current[channel]];
      next[draggingRef.current!.index] = { x, y };
      return { ...current, [channel]: next };
    });
  };

  return (
    <div className={styles.curvesPanel}>
      <div className={styles.panelHeaderRow}>
        <span className={styles.panelTitle}>Curves</span>
        <button type="button" className={styles.resetChip}>Reset</button>
      </div>
      <div className={styles.curvesGrid}>
        {activeChannels.map((channel) => (
          <div key={channel} className={styles.curveChannel}>
            <div className={styles.curveHeader}>{channel}</div>
            <svg
              viewBox="0 0 100 100"
              className={styles.curveSvg}
              onPointerMove={(e) => handlePointerMove(e, channel)}
              onPointerUp={() => (draggingRef.current = null)}
              onPointerLeave={() => (draggingRef.current = null)}
            >
              <path d="M 0 100 L 100 0" className={styles.curveGridLine} />
              <path d="M 0 100 L 100 0" className={styles.curveGuide} />
              <polyline
                points={points[channel].map((p) => `${p.x},${p.y}`).join(" ")}
                className={styles.curveLine}
              />
              {points[channel].map((point, idx) => (
                <circle
                  key={`${channel}-${idx}`}
                  cx={point.x}
                  cy={point.y}
                  r={3.5}
                  className={styles.curveNode}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    draggingRef.current = { channel, index: idx };
                  }}
                />
              ))}
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ColorWorkspace({
  selectedClip,
  onUpdateClip,
}: {
  selectedClip?: EditorClip;
  onUpdateClip: (clipId: string, updates: Partial<EditorClip>) => void;
}) {
  const [activeTool, setActiveTool] = useState<"wheels" | "curves" | "scopes">("wheels");
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof presetMap>("Neutral");
  const clipColor = selectedClip?.color ?? emptyClipColor;

  const updateColor = <K extends keyof EditorClip["color"]>(key: K, value: EditorClip["color"][K]) => {
    if (!selectedClip) return;
    onUpdateClip(selectedClip.id, { color: { ...clipColor, [key]: value } });
  };

  const updateTone = (key: WheelKey, nextTone: ToneGroup) => {
    if (!selectedClip) return;
    onUpdateClip(selectedClip.id, { color: { ...clipColor, [key]: nextTone } });
  };



  const resetAll = () => {
    if (!selectedClip) return;
    onUpdateClip(selectedClip.id, {
      color: {
        ...clipColor,
        lift: { y: 0, r: 0, g: 0, b: 0 },
        gamma: { y: 0, r: 0, g: 0, b: 0 },
        gain: { y: 0, r: 0, g: 0, b: 0 },
        offset: { y: 0, r: 0, g: 0, b: 0 },
        brightness: 0,
        contrast: 0,
        saturation: 0,
        hue: 0,
        temperature: 0,
        tint: 0,
        pivot: 0.5,
        contrastBias: 0,
      },
    });
  };

  const primarySliders = useMemo(
    () => [
      { label: "Lift", min: -100, max: 100, value: Math.round((clipColor.lift?.y ?? 0)), field: "lift" },
      { label: "Gamma", min: -100, max: 100, value: Math.round((clipColor.gamma?.y ?? 0)), field: "gamma" },
      { label: "Gain", min: -100, max: 100, value: Math.round((clipColor.gain?.y ?? 0)), field: "gain" },
      { label: "Offset", min: -100, max: 100, value: Math.round((clipColor.offset?.y ?? 0)), field: "offset" },
      { label: "Contrast", min: -100, max: 100, value: clipColor.contrast, field: "contrast" },
      { label: "Pivot", min: 0, max: 100, value: Math.round((clipColor.pivot ?? 0.5) * 100), field: "pivot" },
      { label: "Saturation", min: 0, max: 200, value: clipColor.saturation + 100, field: "saturation" },
      { label: "Temperature", min: -100, max: 100, value: clipColor.temperature, field: "temperature" },
      { label: "Tint", min: -100, max: 100, value: clipColor.tint, field: "tint" },
    ],
    [clipColor]
  );

  const applySlider = (field: string, nextValue: number) => {
    if (!selectedClip) return;
    if (field === "contrast") updateColor("contrast", nextValue);
    if (field === "pivot") updateColor("pivot", nextValue / 100);
    if (field === "saturation") updateColor("saturation", nextValue - 100);
    if (field === "temperature") updateColor("temperature", nextValue);
    if (field === "tint") updateColor("tint", nextValue);
    if (field === "lift") updateTone("lift", { ...(clipColor.lift ?? { ...defaultTone }), y: nextValue });
    if (field === "gamma") updateTone("gamma", { ...(clipColor.gamma ?? { ...defaultTone }), y: nextValue });
    if (field === "gain") updateTone("gain", { ...(clipColor.gain ?? { ...defaultTone }), y: nextValue });
    if (field === "offset") updateTone("offset", { ...(clipColor.offset ?? { ...defaultTone }), y: nextValue });
  };

  return (
    <section className={styles.colorWorkspace} aria-label="Color workspace professional">
      <div className={styles.workspaceToolbar}>
        {/* Herramientas Principales (Tabs) */}
        <div className={styles.workspaceToolGroup}>
          <button 
            type="button" 
            className={activeTool === "wheels" ? styles.workspaceToolActive : styles.workspaceTool} 
            onClick={() => setActiveTool("wheels")}
            title="Color Wheels & Primaries"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '4px' }}>
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
            </svg>
            Color Wheels
          </button>
          
          <button 
            type="button" 
            className={activeTool === "curves" ? styles.workspaceToolActive : styles.workspaceTool} 
            onClick={() => setActiveTool("curves")}
            title="Curves"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '4px' }}>
              <path d="M3 3v18h18"/><path d="M3 21c4-8 8-12 18-12"/>
            </svg>
            Curves
          </button>

          <button 
            type="button" 
            className={activeTool === "scopes" ? styles.workspaceToolActive : styles.workspaceTool} 
            onClick={() => setActiveTool("scopes")}
            title="Scopes"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '4px' }}>
              <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M12 17V5"/><path d="M6 17v-4"/>
            </svg>
            Scopes
          </button>
        </div>

        {/* Presets - Solo mostrar en ruedas */}
        {activeTool === "wheels" && (
          <div className={styles.presetRow}>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.presetBtn} ${selectedPreset === preset ? styles.presetBtnActive : ""}`}
                onClick={() => {
                  setSelectedPreset(preset);
                  const presetValues = presetMap[preset];
                  if (!selectedClip) return;
                  onUpdateClip(selectedClip.id, {
                    color: {
                      ...clipColor,
                      lift: { y: presetValues.lift.y * 100, r: presetValues.lift.x * 100, g: presetValues.lift.y * 80, b: presetValues.lift.y * 70 },
                      gamma: { y: presetValues.gamma.y * 100, r: presetValues.gamma.x * 100, g: presetValues.gamma.y * 80, b: presetValues.gamma.x * 70 },
                      gain: { y: presetValues.gain.y * 100, r: presetValues.gain.x * 100, g: presetValues.gain.y * 80, b: presetValues.gain.x * 70 },
                      offset: { y: presetValues.offset.y * 100, r: presetValues.offset.x * 100, g: presetValues.offset.y * 90, b: presetValues.offset.x * 90 },
                    },
                  });
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        )}

        <div className={styles.colorActions}>
          <button type="button" className={styles.resetChipDanger} onClick={resetAll}>Reset Color</button>
        </div>
      </div>

      <div className={styles.colorToolContent} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        
        {/* ─── COLOR WHEELS TOOL ─── */}
        {activeTool === "wheels" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.5rem", padding: "0.5rem", overflowY: "auto" }}>
            <div className={styles.colorWheelsPanel}>
              <div className={styles.colorWheelGrid}>
                <ColorWheel
                  label="Lift"
                  tone={clipColor.lift ?? { ...defaultTone }}
                  onChange={(tone) => updateTone("lift", tone)}
                />
                <ColorWheel
                  label="Gamma"
                  tone={clipColor.gamma ?? { ...defaultTone }}
                  onChange={(tone) => updateTone("gamma", tone)}
                />
                <ColorWheel
                  label="Gain"
                  tone={clipColor.gain ?? { ...defaultTone }}
                  onChange={(tone) => updateTone("gain", tone)}
                />
                <ColorWheel
                  label="Offset"
                  tone={clipColor.offset ?? { ...defaultTone }}
                  onChange={(tone) => updateTone("offset", tone)}
                />
              </div>
            </div>

            <div className={styles.primaryControlsPanel}>
              <div className={styles.panelHeaderRow}>
                <span className={styles.panelTitle}>Primary Controls</span>
              </div>
              <div className={styles.sliderList} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem 1.5rem' }}>
                {primarySliders.map((slider) => (
                  <div key={slider.label} className={styles.sliderRow}>
                    <label>{slider.label}</label>
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      value={slider.value}
                      onChange={(event) => applySlider(slider.field, Number(event.target.value))}
                    />
                    <span>{slider.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── CURVES TOOL ─── */}
        {activeTool === "curves" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0.5rem" }}>
            <CurvesPanel />
          </div>
        )}

        {/* ─── SCOPES TOOL ─── */}
        {activeTool === "scopes" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0.5rem" }}>
            <div className={styles.scopesPanel} style={{ width: "100%", flex: 1, display: "flex", flexDirection: "column", marginLeft: 0 }}>
              <div className={styles.panelHeaderRow}>
                <span className={styles.panelTitle}>Scopes</span>
                <span className={styles.scopeHint}>Live analysis</span>
              </div>
              <div className={styles.scopeGrid} style={{ gridTemplateColumns: "repeat(2, 1fr)", flex: 1 }}>
                <div className={styles.scopeBlock}><span>Waveform</span></div>
                <div className={styles.scopeBlock}><span>RGB Parade</span></div>
                <div className={styles.scopeBlock}><span>Histogram</span></div>
                <div className={styles.scopeBlock}><span>Vectorscope</span></div>
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
