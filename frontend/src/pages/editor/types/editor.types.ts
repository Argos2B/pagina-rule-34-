/**
 * Editor Type Definitions
 * 
 * Architecture prepared for full video editor implementation.
 * These types define the data model for: project, tracks, clips, assets,
 * selection, playback state, and history.
 */

// ─── Asset Types ───────────────────────────────────────────────────────────────

export type AssetType = "video" | "audio" | "image" | "text";

export interface EditorAsset {
  id: string;
  name: string;
  type: AssetType;
  /** URL or object URL for imported files */
  src: string;
  /** Duration in seconds (undefined for images/text) */
  duration?: number;
  /** Thumbnail URL for video/image assets */
  thumbnail?: string;
  /** File size in bytes */
  size?: number;
  /** MIME type */
  mimeType?: string;
  createdAt: number;
}

// ─── Clip Types ────────────────────────────────────────────────────────────────

export type ClipType = "video" | "audio" | "image" | "text" | "transition" | "effect";

export interface ClipTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface ClipAudio {
  volume: number;
  muted: boolean;
  pan: number;
}

export interface ClipColorChannelGroup {
  y: number;
  r: number;
  g: number;
  b: number;
}

export interface ClipColor {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  tint: number;
  lift: ClipColorChannelGroup;
  gamma: ClipColorChannelGroup;
  gain: ClipColorChannelGroup;
  offset: ClipColorChannelGroup;
  pivot: number;
  contrastBias: number;
}

export interface EditorClip {
  id: string;
  trackId: string;
  assetId?: string;
  type: ClipType;
  name: string;
  /** Start position on the timeline in seconds */
  startTime: number;
  /** Duration of the clip in seconds */
  duration: number;
  /** Trim from start of source in seconds */
  trimStart: number;
  /** Trim from end of source in seconds */
  trimEnd: number;
  /** Playback speed multiplier */
  speed: number;
  transform: ClipTransform;
  audio: ClipAudio;
  color: ClipColor;
  /** For text clips */
  text?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    bold: boolean;
    italic: boolean;
    align: "left" | "center" | "right";
  };
  /** Applied effects (future) */
  effects: string[];
  selected: boolean;
}

// ─── Track Types ───────────────────────────────────────────────────────────────

export type TrackType = "video" | "audio" | "text" | "effect";

export interface EditorTrack {
  id: string;
  type: TrackType;
  name: string;
  clips: EditorClip[];
  muted: boolean;
  locked: boolean;
  visible: boolean;
  volume: number;
  height: number;
}

// ─── Project Settings ─────────────────────────────────────────────────────────

export interface ProjectSettings {
  fps: number;
  width: number;
  height: number;
  duration: number;
  backgroundColor: string;
  aspectRatio: string;
  safeAreas?: boolean;
}

// ─── Project ───────────────────────────────────────────────────────────────────

export type ProjectStatus = "new" | "modified" | "saving" | "saved" | "error";

export interface EditorProject {
  id: string;
  name: string;
  status: ProjectStatus;
  settings: ProjectSettings;
  tracks: EditorTrack[];
  assets: EditorAsset[];
  createdAt: string;
  updatedAt: string;
}

// ─── Selection ─────────────────────────────────────────────────────────────────

export interface EditorSelection {
  clipIds: string[];
  trackId?: string;
}

// ─── Playback State ────────────────────────────────────────────────────────────

export interface EditorPlaybackState {
  currentTime: number;
  isPlaying: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  duration: number;
}

// ─── History (Undo/Redo) ───────────────────────────────────────────────────────

export interface HistoryAction {
  id: string;
  type: string;
  description: string;
  timestamp: number;
  before: Partial<EditorProject>;
  after: Partial<EditorProject>;
}

export interface EditorHistory {
  actions: HistoryAction[];
  currentIndex: number;
  maxSize: number;
}

// ─── Timeline UI State ─────────────────────────────────────────────────────────

export interface TimelineState {
  /** Pixels per second (zoom level) */
  scale: number;
  scrollLeft: number;
  minScale: number;
  maxScale: number;
}

// ─── Tool Selection ────────────────────────────────────────────────────────────

export type EditorTool =
  | "select"
  | "track"
  | "ripple"
  | "rolling"
  | "rate"
  | "razor"
  | "slip"
  | "slide"
  | "pen"
  | "hand"
  | "zoom"
  | "cut"
  | "split"
  | "text"
  | "audio"
  | "transitions"
  | "effects"
  | "color"
  | "animations"
  | "subtitles"
  | "ai";

export type EditorWorkspace = "edit" | "color" | "audio" | "effects";

export type EditorPanelId = "media" | "preview" | "timeline" | "inspector" | "color" | "effects" | "audio" | "scopes";

export interface EditorPanelLayout {
  visible: boolean;
  width?: number;
  height?: number;
  order: number;
}

export interface EditorLayoutState {
  mediaWidth: number;
  inspectorWidth: number;
  previewHeight: number;
  timelineHeight: number;
  panels: Record<EditorPanelId, EditorPanelLayout>;
}

// ─── Media Panel Tab ───────────────────────────────────────────────────────────

export type MediaPanelTab = "all" | "video" | "audio" | "images";

// ─── Inspector Panel Tab ───────────────────────────────────────────────────────

export type InspectorTab = "properties" | "effects" | "color" | "audio";

// ─── Full Editor State ─────────────────────────────────────────────────────────

export interface EditorState {
  project: EditorProject;
  selection: EditorSelection;
  playback: EditorPlaybackState;
  history: EditorHistory;
  timeline: TimelineState;
  layout: EditorLayoutState;
  activeTool: EditorTool;
  activeWorkspace: EditorWorkspace;
  activeMediaTab: MediaPanelTab;
  activeInspectorTab: InspectorTab;
}
