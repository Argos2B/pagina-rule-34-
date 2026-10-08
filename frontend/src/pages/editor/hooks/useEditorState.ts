/**
 * useEditorState - Central state management hook for the video editor.
 *
 * Real undo/redo via project snapshots (max 50).
 * Real copy/paste of clips.
 * IndexedDB persistence of project JSON + asset Blobs.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { set, get, del } from "idb-keyval";
import type {
  EditorState,
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorAsset,
  EditorTool,
  MediaPanelTab,
  InspectorTab,
  ProjectStatus,
  ProjectSettings,
  EditorWorkspace,
  EditorLayoutState,
  EditorPanelId,
} from "../types/editor.types";

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_HISTORY = 50;
const IDB_PROJECT_KEY = "editor_project_v2";
const IDB_BLOBS_PREFIX = "editor_blob_";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function calcAspectRatio(width: number, height: number): string {
  const normalizedWidth = Math.max(1, Math.round(width));
  const normalizedHeight = Math.max(1, Math.round(height));
  const divisor = gcd(normalizedWidth, normalizedHeight);
  return `${normalizedWidth / divisor}:${normalizedHeight / divisor}`;
}

function normalizeProjectSettings(current: ProjectSettings, updates: Partial<ProjectSettings>): ProjectSettings {
  const width = updates.width ?? current.width;
  const height = updates.height ?? current.height;
  const dimensionsChanged = updates.width !== undefined || updates.height !== undefined;

  return {
    ...current,
    ...updates,
    width,
    height,
    aspectRatio: dimensionsChanged ? calcAspectRatio(width, height) : updates.aspectRatio ?? current.aspectRatio,
  };
}

// ─── Default Project ───────────────────────────────────────────────────────────
function createDefaultProject(): EditorProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "Proyecto sin título",
    status: "new",
    settings: {
      fps: 30,
      width: 1920,
      height: 1080,
      duration: 60,
      backgroundColor: "#000000",
      aspectRatio: "16:9",
    },
    tracks: [
      {
        id: "track-v1",
        type: "video",
        name: "Video 1",
        muted: false,
        locked: false,
        visible: true,
        volume: 1,
        height: 64,
        clips: [],
      },
      {
        id: "track-v2",
        type: "text",
        name: "Texto 1",
        muted: false,
        locked: false,
        visible: true,
        volume: 1,
        height: 48,
        clips: [],
      },
      {
        id: "track-a1",
        type: "audio",
        name: "Audio 1",
        muted: false,
        locked: false,
        visible: true,
        volume: 0.8,
        height: 48,
        clips: [],
      },
    ],
    assets: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Default State ─────────────────────────────────────────────────────────────
function createDefaultLayout(): EditorLayoutState {
  return {
    mediaWidth: 260,
    inspectorWidth: 300,
    previewHeight: 430,
    timelineHeight: 240,
    panels: {
      media: { visible: true, width: 260, order: 0 },
      preview: { visible: true, height: 430, order: 1 },
      timeline: { visible: true, height: 240, order: 2 },
      inspector: { visible: true, width: 300, order: 3 },
      color: { visible: true, order: 4 },
      effects: { visible: true, order: 5 },
      audio: { visible: true, order: 6 },
      scopes: { visible: true, order: 7 },
    },
  };
}

function createDefaultState(): EditorState {
  const project = createDefaultProject();
  return {
    project,
    selection: { clipIds: [] },
    playback: {
      currentTime: 0,
      isPlaying: false,
      speed: 1,
      volume: 1,
      muted: false,
      duration: project.settings.duration,
    },
    history: { actions: [], currentIndex: -1, maxSize: MAX_HISTORY },
    timeline: { scale: 60, scrollLeft: 0, minScale: 10, maxScale: 300 },
    layout: createDefaultLayout(),
    activeTool: "select",
    activeWorkspace: "edit",
    activeMediaTab: "all",
    activeInspectorTab: "properties",
  };
}

// ─── History helpers ────────────────────────────────────────────────────────────
// We store full project snapshots in a separate ref to avoid serializing them into state

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useEditorState() {
  const [state, setState] = useState<EditorState>(() => {
    if (typeof window === "undefined") return createDefaultState();

    const saved = window.localStorage.getItem("editor-workspace-layout-v1");
    if (!saved) return createDefaultState();

    try {
      const parsed = JSON.parse(saved) as Partial<EditorLayoutState>;
      const base = createDefaultState();
      return {
        ...base,
        layout: {
          ...base.layout,
          mediaWidth: parsed.mediaWidth ?? base.layout.mediaWidth,
          inspectorWidth: parsed.inspectorWidth ?? base.layout.inspectorWidth,
          previewHeight: parsed.previewHeight ?? base.layout.previewHeight,
          timelineHeight: parsed.timelineHeight ?? base.layout.timelineHeight,
          panels: {
            ...base.layout.panels,
            ...parsed.panels,
          },
        },
      };
    } catch {
      return createDefaultState();
    }
  });

  const playbackRef = useRef(state.playback);
  const playbackLoopRef = useRef<number | null>(null);
  const lastFrameTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    playbackRef.current = state.playback;
  }, [state.playback]);

  // Undo/Redo snapshot stacks (stored outside React state for performance)
  const undoStackRef = useRef<EditorProject[]>([]);
  const redoStackRef = useRef<EditorProject[]>([]);

  // Copy/Paste clipboard (clip data)
  const clipboardRef = useRef<EditorClip | null>(null);

  // ── Snapshot helpers ──────────────────────────────────────────────────────────

  /** Call BEFORE mutating project. Pushes current project onto undo stack. */
  const pushSnapshot = useCallback((currentProject: EditorProject) => {
    undoStackRef.current.push(JSON.parse(JSON.stringify(currentProject)));
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = []; // clear redo on new action
  }, []);

  /** Wrap any project-mutating setState with snapshot capture. */
  const mutateProject = useCallback(
    (updater: (project: EditorProject) => EditorProject) => {
      setState((s) => {
        pushSnapshot(s.project);
        const newProject = updater(s.project);
        return { ...s, project: { ...newProject, status: "modified" } };
      });
    },
    [pushSnapshot]
  );

  // ── Project ───────────────────────────────────────────────────────────────────

  const setProjectName = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      project: { ...s.project, name, status: "modified", updatedAt: new Date().toISOString() },
    }));
  }, []);

  const setProjectStatus = useCallback((status: ProjectStatus) => {
    setState((s) => ({ ...s, project: { ...s.project, status } }));
  }, []);

  // ── Persistence ───────────────────────────────────────────────────────────────

  const saveProject = useCallback(() => {
    setState((s) => {
      const saving = { ...s, project: { ...s.project, status: "saving" as ProjectStatus } };

      // Persist project JSON (without Blob data – Blobs are stored separately)
      set(IDB_PROJECT_KEY, saving.project)
        .then(() => {
          setState((curr) => ({
            ...curr,
            project: { ...curr.project, status: "saved", updatedAt: new Date().toISOString() },
          }));
        })
        .catch((err) => {
          console.error("Save failed:", err);
          setState((curr) => ({ ...curr, project: { ...curr.project, status: "error" } }));
        });

      return saving;
    });
  }, []);

  /** Store a File/Blob for an asset in IDB so it survives page reload. */
  const saveAssetBlob = useCallback(async (assetId: string, blob: Blob) => {
    try {
      await set(`${IDB_BLOBS_PREFIX}${assetId}`, blob);
    } catch (err) {
      console.warn("Could not persist asset blob:", err);
    }
  }, []);

  /** Reconstruct Object URLs from persisted blobs after loading a project. */
  const loadAssetBlobs = useCallback(async (assets: EditorAsset[]): Promise<EditorAsset[]> => {
    const restored: EditorAsset[] = [];
    for (const asset of assets) {
      try {
        const blob: Blob | undefined = await get(`${IDB_BLOBS_PREFIX}${asset.id}`);
        if (blob) {
          restored.push({ ...asset, src: URL.createObjectURL(blob) });
        } else {
          // Blob not found – asset will be unresolvable (expected on first load without blob)
          restored.push(asset);
        }
      } catch {
        restored.push(asset);
      }
    }
    return restored;
  }, []);

  // Auto-load on mount
  useEffect(() => {
    (async () => {
      const project: EditorProject | undefined = await get(IDB_PROJECT_KEY);
      if (!project) return;

      // Restore Blob URLs for all assets
      const assetsWithUrls = await loadAssetBlobs(project.assets);
      setState((s) => ({
        ...s,
        project: { ...project, assets: assetsWithUrls, status: "saved" },
      }));
    })();
  }, [loadAssetBlobs]);

  // ── Assets ────────────────────────────────────────────────────────────────────

  const addAsset = useCallback(
    (asset: EditorAsset, blob?: Blob) => {
      mutateProject((p) => ({ ...p, assets: [...p.assets, asset] }));
      if (blob) {
        saveAssetBlob(asset.id, blob).catch(console.warn);
      }
    },
    [mutateProject, saveAssetBlob]
  );

  const removeAsset = useCallback(
    (assetId: string) => {
      mutateProject((p) => ({
        ...p,
        assets: p.assets.filter((a) => a.id !== assetId),
      }));
      // Clean up IDB blob
      del(`${IDB_BLOBS_PREFIX}${assetId}`).catch(console.warn);
    },
    [mutateProject]
  );

  const updateProjectSettings = useCallback(
    (updates: Partial<ProjectSettings>) => {
      mutateProject((p) => ({ ...p, settings: normalizeProjectSettings(p.settings, updates) }));
    },
    [mutateProject]
  );

  // ── Tracks ────────────────────────────────────────────────────────────────────

  const updateTrack = useCallback(
    (trackId: string, updates: Partial<EditorTrack>) => {
      mutateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
      }));
    },
    [mutateProject]
  );

  const addTrack = useCallback(() => {
    mutateProject((p) => {
      const videoTrackCount = p.tracks.filter((t) => t.type === "video").length;
      const newTrack: EditorTrack = {
        id: crypto.randomUUID(),
        type: "video",
        name: `Video ${videoTrackCount + 1}`,
        muted: false,
        locked: false,
        visible: true,
        volume: 1,
        height: 64,
        clips: [],
      };

      const firstAudioIndex = p.tracks.findIndex((track) => track.type === "audio");
      const tracks =
        firstAudioIndex === -1
          ? [...p.tracks, newTrack]
          : [...p.tracks.slice(0, firstAudioIndex), newTrack, ...p.tracks.slice(firstAudioIndex)];

      return { ...p, tracks };
    });
  }, [mutateProject]);

  // ── Clips ─────────────────────────────────────────────────────────────────────

  const selectClip = useCallback((clipId: string, multiSelect = false) => {
    setState((s) => {
      const newClipIds = multiSelect
        ? s.selection.clipIds.includes(clipId)
          ? s.selection.clipIds.filter((id) => id !== clipId)
          : [...s.selection.clipIds, clipId]
        : [clipId];

      const updatedTracks = s.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({ ...clip, selected: newClipIds.includes(clip.id) })),
      }));

      return { ...s, selection: { clipIds: newClipIds }, project: { ...s.project, tracks: updatedTracks } };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setState((s) => ({
      ...s,
      selection: { clipIds: [] },
      project: {
        ...s.project,
        tracks: s.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => ({ ...clip, selected: false })),
        })),
      },
    }));
  }, []);

  const updateClip = useCallback(
    (clipId: string, updates: Partial<EditorClip>) => {
      mutateProject((p) => ({
        ...p,
        tracks: p.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...updates } : clip)),
        })),
      }));
    },
    [mutateProject]
  );

  const addClip = useCallback(
    (trackId: string, clip: EditorClip) => {
      mutateProject((p) => ({
        ...p,
        tracks: p.tracks.map((track) =>
          track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track
        ),
      }));
    },
    [mutateProject]
  );

  const moveClip = useCallback(
    (clipId: string, newStartTime: number) => {
      mutateProject((p) => ({
        ...p,
        tracks: p.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, startTime: Math.max(0, newStartTime) } : clip
          ),
        })),
      }));
    },
    [mutateProject]
  );

  const trimClip = useCallback(
    (clipId: string, updates: { startTime?: number; duration?: number; trimStart?: number; trimEnd?: number }) => {
      mutateProject((p) => ({
        ...p,
        tracks: p.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;

            const speed = Math.max(0.01, clip.speed);
            const asset = clip.assetId ? p.assets.find((a) => a.id === clip.assetId) : undefined;
            const assetDuration =
              asset?.duration && Number.isFinite(asset.duration) && asset.duration > 0
                ? asset.duration
                : undefined;
            const minTimelineDuration = 0.05;
            const minSourceDuration = minTimelineDuration * speed;

            if (updates.trimStart !== undefined) {
              const maxTrimStart = Math.max(0, clip.trimEnd - minSourceDuration);
              let nextTrimStart = Math.max(0, Math.min(updates.trimStart, maxTrimStart));
              let nextStartTime = clip.startTime + (nextTrimStart - clip.trimStart) / speed;

              if (nextStartTime < 0) {
                nextStartTime = 0;
                nextTrimStart = Math.max(0, clip.trimStart - clip.startTime * speed);
              }

              const nextDuration = (clip.trimEnd - nextTrimStart) / speed;
              if (nextDuration <= minTimelineDuration) return clip;

              return {
                ...clip,
                startTime: nextStartTime,
                duration: nextDuration,
                trimStart: nextTrimStart,
              };
            }

            if (updates.trimEnd !== undefined || updates.duration !== undefined) {
              const requestedTrimEnd =
                updates.trimEnd ?? clip.trimStart + Math.max(minTimelineDuration, updates.duration ?? clip.duration) * speed;
              const maxTrimEnd = assetDuration ?? Number.POSITIVE_INFINITY;
              const nextTrimEnd = Math.max(
                clip.trimStart + minSourceDuration,
                Math.min(requestedTrimEnd, maxTrimEnd)
              );
              const nextDuration = (nextTrimEnd - clip.trimStart) / speed;
              if (nextDuration <= minTimelineDuration) return clip;

              return {
                ...clip,
                duration: nextDuration,
                trimEnd: nextTrimEnd,
              };
            }

            const merged = { ...clip, ...updates };
            if (merged.duration <= minTimelineDuration) return clip;
            return merged;
          }),
        })),
      }));
    },
    [mutateProject]
  );

  const deleteSelectedClips = useCallback(() => {
    setState((s) => {
      const { clipIds } = s.selection;
      if (clipIds.length === 0) return s;

      pushSnapshot(s.project);
      const newTracks = s.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => !clipIds.includes(c.id)),
      }));

      return {
        ...s,
        selection: { clipIds: [] },
        project: { ...s.project, tracks: newTracks, status: "modified" },
      };
    });
  }, [pushSnapshot]);

  const duplicateSelectedClips = useCallback(() => {
    setState((s) => {
      const { clipIds } = s.selection;
      if (clipIds.length === 0) return s;

      pushSnapshot(s.project);
      const newTracks = s.project.tracks.map((track) => {
        const newClips = [...track.clips];
        for (const clip of track.clips.filter((c) => clipIds.includes(c.id))) {
          newClips.push({
            ...clip,
            id: crypto.randomUUID(),
            startTime: clip.startTime + clip.duration,
            selected: false,
          });
        }
        return { ...track, clips: newClips };
      });

      return { ...s, project: { ...s.project, tracks: newTracks, status: "modified" } };
    });
  }, [pushSnapshot]);

  const copySelectedClip = useCallback(() => {
    setState((s) => {
      const { clipIds } = s.selection;
      if (clipIds.length === 0) return s;
      for (const track of s.project.tracks) {
        const clip = track.clips.find((c) => c.id === clipIds[0]);
        if (clip) {
          clipboardRef.current = JSON.parse(JSON.stringify(clip));
          break;
        }
      }
      return s;
    });
  }, []);

  const pasteClip = useCallback(() => {
    const copied = clipboardRef.current;
    if (!copied) return;

    setState((s) => {
      pushSnapshot(s.project);
      const newClip: EditorClip = {
        ...copied,
        id: crypto.randomUUID(),
        startTime: copied.startTime + copied.duration + 0.5, // Place after original with small gap
        selected: false,
      };

      const newTracks = s.project.tracks.map((track) =>
        track.id === copied.trackId ? { ...track, clips: [...track.clips, newClip] } : track
      );

      return { ...s, project: { ...s.project, tracks: newTracks, status: "modified" } };
    });
  }, [pushSnapshot]);

  const splitClip = useCallback(() => {
    setState((s) => {
      const { clipIds } = s.selection;
      if (clipIds.length !== 1) return s;

      const clipId = clipIds[0];
      const time = s.playback.currentTime;

      pushSnapshot(s.project);

      const newTracks = s.project.tracks.map((track) => {
        const clipIndex = track.clips.findIndex((c) => c.id === clipId);
        if (clipIndex === -1) return track;

        const clip = track.clips[clipIndex];

        // Playhead must be strictly inside the clip
        if (time <= clip.startTime || time >= clip.startTime + clip.duration) return track;

        const timeOffset = time - clip.startTime;
        const mediaTimeOffset = timeOffset * clip.speed;

        const clipA: EditorClip = {
          ...clip,
          duration: timeOffset,
          trimEnd: clip.trimStart + mediaTimeOffset,
        };

        const clipB: EditorClip = {
          ...clip,
          id: crypto.randomUUID(),
          startTime: time,
          duration: clip.duration - timeOffset,
          trimStart: clip.trimStart + mediaTimeOffset,
          selected: false,
        };

        const newClips = [...track.clips];
        newClips.splice(clipIndex, 1, clipA, clipB);
        return { ...track, clips: newClips };
      });

      return { ...s, project: { ...s.project, tracks: newTracks, status: "modified" } };
    });
  }, [pushSnapshot]);

  // ── Playback ──────────────────────────────────────────────────────────────────

  const stopPlaybackLoop = useCallback(() => {
    if (playbackLoopRef.current !== null) {
      cancelAnimationFrame(playbackLoopRef.current);
      playbackLoopRef.current = null;
    }
    lastFrameTimestampRef.current = null;
  }, []);

  const startPlaybackLoop = useCallback(() => {
    if (playbackLoopRef.current !== null) return;

    const tick = (timestamp: number) => {
      if (lastFrameTimestampRef.current === null) {
        lastFrameTimestampRef.current = timestamp;
      }

      const deltaSeconds = Math.min((timestamp - lastFrameTimestampRef.current) / 1000, 0.05);
      lastFrameTimestampRef.current = timestamp;

      let shouldContinue = false;

      setState((curr) => {
        if (!curr.playback.isPlaying) {
          shouldContinue = false;
          return curr;
        }

        const nextTime = curr.playback.currentTime + deltaSeconds * curr.playback.speed;
        const reachedEnd = nextTime >= curr.playback.duration;
        shouldContinue = !reachedEnd;

        return {
          ...curr,
          playback: {
            ...curr.playback,
            currentTime: reachedEnd ? curr.playback.duration : nextTime,
            isPlaying: !reachedEnd,
          },
        };
      });

      if (shouldContinue) {
        playbackLoopRef.current = requestAnimationFrame(tick);
      } else {
        playbackLoopRef.current = null;
        lastFrameTimestampRef.current = null;
      }
    };

    playbackLoopRef.current = requestAnimationFrame(tick);
  }, []);

  const setCurrentTime = useCallback((time: number) => {
    setState((s) => ({
      ...s,
      playback: {
        ...s.playback,
        currentTime: Math.max(0, Math.min(time, s.playback.duration)),
      },
    }));
  }, []);

  const play = useCallback(() => {
    setState((s) => {
      if (s.playback.isPlaying) return s;
      return { ...s, playback: { ...s.playback, isPlaying: true } };
    });
    startPlaybackLoop();
  }, [startPlaybackLoop]);

  const pause = useCallback(() => {
    stopPlaybackLoop();
    setState((s) => {
      if (!s.playback.isPlaying) return s;
      return { ...s, playback: { ...s.playback, isPlaying: false } };
    });
  }, [stopPlaybackLoop]);

  const togglePlay = useCallback(() => {
    setState((s) => {
      const nextIsPlaying = !s.playback.isPlaying;
      if (nextIsPlaying) {
        startPlaybackLoop();
      } else {
        stopPlaybackLoop();
      }
      return { ...s, playback: { ...s.playback, isPlaying: nextIsPlaying } };
    });
  }, [startPlaybackLoop, stopPlaybackLoop]);

  const setVolume = useCallback((volume: number) => {
    setState((s) => ({
      ...s,
      playback: { ...s.playback, volume: Math.max(0, Math.min(1, volume)) },
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((s) => ({ ...s, playback: { ...s.playback, muted: !s.playback.muted } }));
  }, []);

  // ── Tools ─────────────────────────────────────────────────────────────────────

  const setActiveTool = useCallback((tool: EditorTool) => {
    setState((s) => ({ ...s, activeTool: tool }));
  }, []);

  const setActiveWorkspace = useCallback((workspace: EditorWorkspace) => {
    setState((s) => ({ ...s, activeWorkspace: workspace }));
  }, []);

  const setActiveMediaTab = useCallback((tab: MediaPanelTab) => {
    setState((s) => ({ ...s, activeMediaTab: tab }));
  }, []);

  const setActiveInspectorTab = useCallback((tab: InspectorTab) => {
    setState((s) => ({ ...s, activeInspectorTab: tab }));
  }, []);

  const setPanelVisibility = useCallback((panel: EditorPanelId, visible: boolean) => {
    setState((s) => ({
      ...s,
      layout: {
        ...s.layout,
        panels: {
          ...s.layout.panels,
          [panel]: { ...s.layout.panels[panel], visible },
        },
      },
    }));
  }, []);

  const setPanelSize = useCallback((panel: EditorPanelId, size: { width?: number; height?: number }) => {
    setState((s) => {
      const nextLayout = {
        ...s.layout,
        mediaWidth: panel === "media" ? size.width ?? s.layout.mediaWidth : s.layout.mediaWidth,
        inspectorWidth: panel === "inspector" ? size.width ?? s.layout.inspectorWidth : s.layout.inspectorWidth,
        previewHeight: panel === "preview" ? size.height ?? s.layout.previewHeight : s.layout.previewHeight,
        timelineHeight: panel === "timeline" ? size.height ?? s.layout.timelineHeight : s.layout.timelineHeight,
        panels: {
          ...s.layout.panels,
          [panel]: { ...s.layout.panels[panel], width: size.width ?? s.layout.panels[panel].width, height: size.height ?? s.layout.panels[panel].height },
        },
      };
      return { ...s, layout: nextLayout };
    });
  }, []);

  const resetWorkspaceLayout = useCallback(() => {
    const defaultLayout = createDefaultLayout();
    setState((s) => ({ ...s, layout: defaultLayout }));
    if (typeof window !== "undefined") {
      window.localStorage.setItem("editor-workspace-layout-v1", JSON.stringify(defaultLayout));
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("editor-workspace-layout-v1", JSON.stringify(state.layout));
    }
  }, [state.layout]);

  // ── Timeline ──────────────────────────────────────────────────────────────────

  const setTimelineScale = useCallback((scale: number) => {
    setState((s) => ({
      ...s,
      timeline: {
        ...s.timeline,
        scale: Math.max(s.timeline.minScale, Math.min(s.timeline.maxScale, scale)),
      },
    }));
  }, []);

  const setTimelineScroll = useCallback((scrollLeft: number) => {
    setState((s) => ({
      ...s,
      timeline: { ...s.timeline, scrollLeft: Math.max(0, scrollLeft) },
    }));
  }, []);

  useEffect(() => {
    return () => {
      stopPlaybackLoop();
    };
  }, [stopPlaybackLoop]);

  // ── History (real snapshot-based undo/redo) ──────────────────────────────────

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  const undo = useCallback(() => {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;

    setState((s) => {
      redoStackRef.current.push(JSON.parse(JSON.stringify(s.project)));
      return { ...s, project: { ...snapshot, status: "modified" } };
    });
  }, []);

  const redo = useCallback(() => {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) return;

    setState((s) => {
      undoStackRef.current.push(JSON.parse(JSON.stringify(s.project)));
      return { ...s, project: { ...snapshot, status: "modified" } };
    });
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────────

  return {
    state,
    // Project
    setProjectName,
    setProjectStatus,
    saveProject,
    updateProjectSettings,
    // Assets
    addAsset,
    removeAsset,
    // Tracks
    updateTrack,
    addTrack,
    // Clips
    selectClip,
    clearSelection,
    updateClip,
    addClip,
    moveClip,
    trimClip,
    deleteSelectedClips,
    duplicateSelectedClips,
    copySelectedClip,
    pasteClip,
    splitClip,
    // Playback
    setCurrentTime,
    play,
    pause,
    togglePlay,
    setVolume,
    toggleMute,
    // Tools
    setActiveTool,
    setActiveWorkspace,
    setActiveMediaTab,
    setActiveInspectorTab,
    setPanelVisibility,
    setPanelSize,
    resetWorkspaceLayout,
    // Timeline
    setTimelineScale,
    setTimelineScroll,
    // History
    canUndo,
    canRedo,
    undo,
    redo,
  };
}

export type EditorActions = ReturnType<typeof useEditorState>;
