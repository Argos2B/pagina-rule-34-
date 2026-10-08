/**
 * PreviewPanel — Real video/audio/image compositor on HTML5 Canvas.
 *
 * - Uses HTMLVideoElement / HTMLAudioElement cache per asset (never recreated per frame)
 * - Syncs mediaTime = (projectTime - startTime) * speed + trimStart
 * - Applies transform: translate, rotate, scale, globalAlpha
 * - Applies CSS color adjustments as canvas filter string
 * - Handles play/pause/seek for all media types
 */

import { useEffect, useRef, useState } from "react";
import type { EditorPlaybackState, EditorProject, EditorClip } from "../types/editor.types";
import { ProjectCanvas, type ViewportZoom } from "./ProjectCanvas";
import styles from "../EditorPage.module.css";

interface PreviewPanelProps {
  project: EditorProject;
  playback: EditorPlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSetVolume: (volume: number) => void;
  onToggleMute: () => void;
}

function formatTime(seconds: number): string {
  const m  = Math.floor(seconds / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}

/** Build a CSS filter string from clip's color adjustments and effect list. */
function buildFilter(clip: EditorClip): string {
  const { color, effects } = clip;

  const lift = color.lift ?? { y: 0, r: 0, g: 0, b: 0 };
  const gamma = color.gamma ?? { y: 0, r: 0, g: 0, b: 0 };
  const gain = color.gain ?? { y: 0, r: 0, g: 0, b: 0 };
  const offset = color.offset ?? { y: 0, r: 0, g: 0, b: 0 };

  const lumaBoost = 1 + (lift.y + gamma.y + gain.y + offset.y) / 250;
  const brightnessValue = 1 + (color.brightness + lift.y * 0.35 + gamma.y * 0.2 + gain.y * 0.15) / 120;
  const contrastValue = 1 + (color.contrast + color.contrastBias + gain.y * 0.25) / 140;
  const saturationValue = 1 + (color.saturation + gain.r * 0.15 + gain.g * 0.16 + gain.b * 0.15) / 150;
  const hueValue = color.hue + (gain.r - gain.g) * 0.7;
  const temperatureValue = color.temperature + (gain.r - gain.b) * 0.3;

  const parts: string[] = [];

  if (Math.abs(brightnessValue - 1) > 0.01) parts.push(`brightness(${brightnessValue.toFixed(3)})`);
  if (Math.abs(contrastValue - 1) > 0.01) parts.push(`contrast(${contrastValue.toFixed(3)})`);
  if (Math.abs(saturationValue - 1) > 0.01) parts.push(`saturate(${saturationValue.toFixed(3)})`);
  if (Math.abs(hueValue) > 0.01) parts.push(`hue-rotate(${hueValue.toFixed(2)}deg)`);
  if (Math.abs(temperatureValue) > 0.01) {
    const t = clampValue(temperatureValue / 150, -1, 1);
    if (t > 0) parts.push(`sepia(${Math.max(0, t * 0.8).toFixed(3)})`);
    else parts.push(`hue-rotate(${(t * 35).toFixed(2)}deg)`);
  }
  if (Math.abs(lumaBoost - 1) > 0.01) parts.push(`brightness(${Math.max(0.3, lumaBoost).toFixed(3)})`);

  if (effects.includes("blur")) parts.push("blur(4px)");
  if (effects.includes("sharpen")) parts.push("contrast(1.5) saturate(1.2)");
  if (effects.includes("grayscale")) parts.push("grayscale(1)");
  if (effects.includes("sepia")) parts.push("sepia(0.8)");
  if (effects.includes("vignette")) parts.push("brightness(0.85)");

  return parts.join(" ") || "none";
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getContainRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: targetWidth, height: targetHeight };
  }

  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}

export function PreviewPanel({
  project,
  playback,
  onTogglePlay,
  onSeek,
  onSetVolume,
  onToggleMute,
}: PreviewPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectRef = useRef(project);
  const playbackRef = useRef(playback);
  const animationIdRef = useRef<number | null>(null);
  // Cache: assetId → HTMLVideoElement or HTMLAudioElement
  const mediaCache = useRef<Map<string, HTMLVideoElement | HTMLAudioElement>>(new Map());
  // Cache: assetId → HTMLImageElement
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [zoomLevel, setZoomLevel] = useState<ViewportZoom>("fit");

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const progress = playback.duration > 0 ? (playback.currentTime / playback.duration) * 100 : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const currentProject = projectRef.current;
      const currentPlayback = playbackRef.current;
      const { currentTime, isPlaying, volume, muted, speed: globalSpeed } = currentPlayback;

      const activeItems = currentProject.tracks
        .filter((track) => track.visible)
        .flatMap((track) =>
          track.clips
            .filter((clip) => currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration)
            .map((clip) => ({ track, clip }))
        );

      const neededAssetIds = new Set(activeItems.map(({ clip }) => clip.assetId));
      for (const [id, el] of mediaCache.current.entries()) {
        if (!neededAssetIds.has(id)) {
          el.pause();
          el.src = "";
          el.load();
          mediaCache.current.delete(id);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = currentProject.settings.backgroundColor ?? "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;

      for (const { track, clip } of activeItems) {
        if (!clip.assetId) continue;
        const asset = currentProject.assets.find((a) => a.id === clip.assetId);
        if (!asset) continue;

        const localTime = currentTime - clip.startTime;
        const mediaTime = localTime * clip.speed * globalSpeed + clip.trimStart;
        const filterStr = buildFilter(clip);

        ctx.save();

        const cx = canvas.width / 2 + clip.transform.x;
        const cy = canvas.height / 2 + clip.transform.y;
        ctx.translate(cx, cy);
        ctx.rotate((clip.transform.rotation * Math.PI) / 180);
        ctx.scale(clip.transform.scaleX, clip.transform.scaleY);
        ctx.globalAlpha = clip.transform.opacity;
        ctx.filter = filterStr;

        if (asset.type === "video") {
          let video = mediaCache.current.get(asset.id) as HTMLVideoElement | undefined;
          if (!video) {
            video = document.createElement("video");
            video.src = asset.src;
            video.preload = "auto";
            video.playsInline = true;
            video.muted = true;
            mediaCache.current.set(asset.id, video);
          }

          video.playbackRate = clip.speed * globalSpeed;
          video.volume = muted || track.muted ? 0 : Math.min(1, (clip.audio?.volume ?? 1) * track.volume * volume);
          video.muted = clip.audio?.muted || track.muted || muted;

          if (!isPlaying && Math.abs(video.currentTime - mediaTime) > 0.25) {
            if (!video.seeking) {
              video.currentTime = Math.max(0, mediaTime);
            }
          }

          if (isPlaying && video.paused) {
            video.play().catch(() => undefined);
          } else if (!isPlaying && !video.paused) {
            video.pause();
          }

          if (video.readyState >= 2) {
            const w = video.videoWidth || canvas.width;
            const h = video.videoHeight || canvas.height;
            const rect = getContainRect(w, h, canvas.width, canvas.height);
            ctx.drawImage(video, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
          }
        } else if (asset.type === "audio") {
          let audio = mediaCache.current.get(asset.id) as HTMLAudioElement | undefined;
          if (!audio) {
            audio = document.createElement("audio");
            audio.src = asset.src;
            audio.preload = "auto";
            mediaCache.current.set(asset.id, audio);
          }

          audio.playbackRate = clip.speed * globalSpeed;
          audio.volume = muted || track.muted ? 0 : Math.min(1, (clip.audio?.volume ?? 1) * track.volume * volume);
          audio.muted = clip.audio?.muted || track.muted || muted;

          if (!isPlaying && Math.abs(audio.currentTime - mediaTime) > 0.25) {
            if (!audio.seeking) {
              audio.currentTime = Math.max(0, mediaTime);
            }
          }

          if (isPlaying && audio.paused) {
            audio.play().catch(() => undefined);
          } else if (!isPlaying && !audio.paused) {
            audio.pause();
          }
        } else if (asset.type === "image") {
          let img = imageCache.current.get(asset.id);
          if (!img) {
            img = new Image();
            img.src = asset.src;
            imageCache.current.set(asset.id, img);
          }
          if (img.complete && img.naturalWidth > 0) {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const rect = getContainRect(w, h, canvas.width, canvas.height);
            ctx.drawImage(img, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
          }
        }
        
        ctx.filter = "none";
        ctx.restore();
      }

      // Draw Safe Areas if enabled
      if ((currentProject.settings as any).safeAreas) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);

        // Action Safe (90%)
        const aw = canvas.width * 0.9;
        const ah = canvas.height * 0.9;
        ctx.strokeRect((canvas.width - aw) / 2, (canvas.height - ah) / 2, aw, ah);

        // Title Safe (80%)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        const tw = canvas.width * 0.8;
        const th = canvas.height * 0.8;
        ctx.strokeRect((canvas.width - tw) / 2, (canvas.height - th) / 2, tw, th);

        // Center crosshair
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - 15, canvas.height / 2);
        ctx.lineTo(canvas.width / 2 + 15, canvas.height / 2);
        ctx.moveTo(canvas.width / 2, canvas.height / 2 - 15);
        ctx.lineTo(canvas.width / 2, canvas.height / 2 + 15);
        ctx.stroke();
        
        ctx.restore();
      }

      animationIdRef.current = requestAnimationFrame(render);
    };

    animationIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
      }
      for (const el of mediaCache.current.values()) {
        el.pause();
      }
    };
  }, []);

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * playback.duration);
  }

  const hasClips = project.tracks.flatMap((t) => t.clips).length > 0;

  const handleZoomOut = () => setZoomLevel(z => typeof z === "number" ? Math.max(10, z - 25) : 75);
  const handleZoomIn = () => setZoomLevel(z => typeof z === "number" ? Math.min(400, z + 25) : 125);
  const handleFit = () => setZoomLevel("fit");

  return (
    <section className={styles.previewPanel} aria-label="Vista previa del vídeo">
      {/* Zoom controls */}
      <div className={styles.previewTopBar}>
        <div className={styles.zoomControls}>
          <button className={styles.zoomBtn} onClick={handleZoomOut} title="Alejar">[ − ]</button>
          <span className={styles.zoomLabel}>{zoomLevel === "fit" ? "Fit" : `${zoomLevel}%`}</span>
          <button className={styles.zoomBtn} onClick={handleZoomIn} title="Acercar">[ + ]</button>
          <button className={styles.zoomBtn} onClick={handleFit} title="Ajustar a pantalla">[ Fit ]</button>
        </div>
      </div>

      {/* Preview screen */}
      <div
        className={styles.previewScreen}
        id="editor-preview-screen"
      >
        <ProjectCanvas project={project} zoom={zoomLevel} canvasRef={canvasRef}>
          {/* Idle overlay when no clips */}
          {!hasClips && (
            <div
              className={styles.previewScreenInner}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.1 }}>
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="1.5"/>
                <polygon points="10,9 16,12 10,15" fill="white"/>
              </svg>
              <p className={styles.previewIdleText}>
                Importa vídeos al panel de medios<br />
                y arrástralos al timeline
              </p>
            </div>
          )}

          {/* Timecode overlay */}
          <div className={styles.previewTime} aria-live="polite" aria-atomic="true">
            {formatTime(playback.currentTime)}
          </div>
        </ProjectCanvas>
      </div>

      {/* Controls */}
      <div className={styles.previewControls}>
        <div className={styles.playbackBtns}>
          {/* To start */}
          <button id="editor-preview-start" type="button" className={styles.controlBtn}
            title="Ir al inicio" onClick={() => onSeek(0)}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <polygon points="2,2 6,6 2,10" fill="currentColor"/>
              <rect x="8" y="2" width="2" height="8" fill="currentColor"/>
              <rect x="2" y="2" width="1.5" height="8" fill="currentColor"/>
            </svg>
          </button>

          {/* Play / Pause */}
          <button id="editor-preview-play" type="button" className={styles.playBtn}
            title={playback.isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
            aria-pressed={playback.isPlaying}
            onClick={onTogglePlay}>
            {playback.isPlaying ? (
              <svg width="10" height="12" viewBox="0 0 12 14" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="3.5" height="12" rx="1" fill="currentColor"/>
                <rect x="7.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="10" height="12" viewBox="0 0 12 14" fill="none" aria-hidden="true">
                <polygon points="1,1 11,7 1,13" fill="currentColor"/>
              </svg>
            )}
          </button>

          {/* To end */}
          <button id="editor-preview-end" type="button" className={styles.controlBtn}
            title="Ir al final" onClick={() => onSeek(playback.duration)}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <polygon points="4,2 8,6 4,10" fill="currentColor"/>
              <rect x="8.5" y="2" width="1.5" height="8" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {/* Seek bar */}
        <div className={styles.previewSeekBar}>
          <div
            id="editor-seekbar"
            className={styles.seekTrack}
            role="slider"
            aria-label="Posición de reproducción"
            aria-valuenow={Math.round(playback.currentTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(playback.duration)}
            onClick={handleSeekClick}
          >
            <div className={styles.seekFill} style={{ width: `${progress}%` }} />
            <div className={styles.seekThumb} style={{ left: `${progress}%` }} />
          </div>
          <div className={styles.timeDisplay}>
            <span>{formatTime(playback.currentTime)}</span>
            <span>{formatTime(playback.duration)}</span>
          </div>
        </div>

        {/* Volume */}
        <div className={styles.volumeControl}>
          <button id="editor-preview-mute" type="button" className={styles.controlBtn}
            title={playback.muted ? "Activar sonido" : "Silenciar"}
            aria-pressed={playback.muted}
            onClick={onToggleMute}>
            {playback.muted ? (
              <svg width="12" height="10" viewBox="0 0 14 12" fill="none" aria-hidden="true">
                <polygon points="1,4 4,4 7,2 7,10 4,8 1,8" fill="currentColor"/>
                <line x1="10" y1="4" x2="13" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="13" y1="4" x2="10" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            ) : playback.volume < 0.4 ? (
              <svg width="12" height="10" viewBox="0 0 14 12" fill="none" aria-hidden="true">
                <polygon points="1,4 4,4 7,2 7,10 4,8 1,8" fill="currentColor"/>
                <path d="M9 5c.4.3.7.7.7 1.3s-.3 1-.7 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
              </svg>
            ) : (
              <svg width="12" height="10" viewBox="0 0 14 12" fill="none" aria-hidden="true">
                <polygon points="1,4 4,4 7,2 7,10 4,8 1,8" fill="currentColor"/>
                <path d="M9 4c.7.5 1.1 1.2 1.1 2s-.4 1.5-1.1 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
                <path d="M10.5 2.5c1.1.9 1.8 2.1 1.8 3.5s-.7 2.6-1.8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
              </svg>
            )}
          </button>
          <input
            id="editor-volume-slider"
            type="range"
            min={0} max={1} step={0.01}
            value={playback.muted ? 0 : playback.volume}
            className={styles.volumeSlider}
            aria-label="Volumen"
            onChange={(e) => onSetVolume(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </section>
  );
}
