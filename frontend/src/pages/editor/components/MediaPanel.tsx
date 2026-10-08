/**
 * MediaPanel — Manages project assets (video, audio, images).
 * 
 * - Tabs to filter by type
 * - Import zone (click or drag-and-drop)
 * - Asset list
 * 
 * Real file processing is to be implemented in a future phase.
 */

import { useRef } from "react";
import type { EditorAsset, MediaPanelTab, AssetType } from "../types/editor.types";
import styles from "../EditorPage.module.css";

interface MediaPanelProps {
  assets: EditorAsset[];
  activeTab: MediaPanelTab;
  onSetTab: (tab: MediaPanelTab) => void;
  onAddAsset: (asset: EditorAsset, blob: Blob) => void;
  onRemoveAsset: (id: string) => void;
}

const TABS: { id: MediaPanelTab; label: string }[] = [
  { id: "all",    label: "Todo"     },
  { id: "video",  label: "Vídeo"   },
  { id: "audio",  label: "Audio"   },
  { id: "images", label: "Imagen"  },
];

const ASSET_ICONS: Record<AssetType, string> = {
  video: "🎬",
  audio: "🎵",
  image: "🖼",
  text: "T",
};

const TAB_ASSET_TYPE: Record<MediaPanelTab, AssetType | null> = {
  all: null,
  video: "video",
  audio: "audio",
  images: "image",
};

const ACCEPT_TYPES: Record<MediaPanelTab, string> = {
  all: "video/*,audio/*,image/*",
  video: "video/*",
  audio: "audio/*",
  images: "image/*",
};

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaPanel({
  assets,
  activeTab,
  onSetTab,
  onAddAsset,
  onRemoveAsset,
}: MediaPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets =
    activeTab === "all"
      ? assets
      : assets.filter((a) => a.type === TAB_ASSET_TYPE[activeTab]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    
    for (const file of Array.from(files)) {
      let type: AssetType = "video";
      if (file.type.startsWith("audio/")) type = "audio";
      else if (file.type.startsWith("image/")) type = "image";
      
      const src = URL.createObjectURL(file);
      let duration: number | undefined = undefined;
      
      if (type === "video" || type === "audio") {
        duration = await new Promise<number>((resolve) => {
          const media = document.createElement(type);
          media.onloadedmetadata = () => resolve(media.duration);
          media.onerror = () => resolve(0);
          media.src = src;
        });
      }

      const asset: EditorAsset = {
        id: crypto.randomUUID(),
        name: file.name,
        type,
        src,
        size: file.size,
        mimeType: file.type,
        createdAt: Date.now(),
        duration,
      };
      onAddAsset(asset, file);  // Pass File (which is a Blob) for IDB persistence
    }
  };

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <section className={styles.mediaPanel} aria-label="Panel de medios">
      {/* Tabs */}
      <div className={styles.mediaTabs} role="tablist" aria-label="Filtrar medios">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`media-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.mediaTab} ${activeTab === tab.id ? styles.mediaTabActive : ""}`}
            onClick={() => onSetTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        className={styles.mediaContent}
        role="tabpanel"
        aria-labelledby={`media-tab-${activeTab}`}
      >
        {/* Import zone */}
        <div
          className={styles.importZone}
          role="button"
          tabIndex={0}
          aria-label="Importar archivos multimedia"
          title="Haz clic o arrastra archivos aquí"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div className={styles.importZoneIcon} aria-hidden="true">+</div>
          <p className={styles.importZoneTitle}>Importar archivos</p>
          <p className={styles.importZoneSubtitle}>
            Haz clic o arrastra aquí<br />
            vídeos, audios e imágenes
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_TYPES[activeTab]}
            className={styles.importZoneHidden}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>

        {/* Asset list */}
        {filteredAssets.length > 0 ? (
          <div className={styles.assetSection}>
            <p className={styles.assetSectionTitle}>
              {filteredAssets.length} archivo{filteredAssets.length !== 1 ? "s" : ""}
            </p>
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className={styles.assetItem}
                title={asset.name}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/json", JSON.stringify(asset));
                }}
              >
                <div className={styles.assetThumb} aria-hidden="true">
                  {asset.thumbnail ? (
                    <img src={asset.thumbnail} alt="" />
                  ) : (
                    ASSET_ICONS[asset.type]
                  )}
                </div>
                <div className={styles.assetInfo}>
                  <span className={styles.assetName}>{asset.name}</span>
                  <span className={styles.assetMeta}>
                    {formatDuration(asset.duration)}
                    {asset.duration && asset.size ? " · " : ""}
                    {formatSize(asset.size)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.trackHeaderBtn}
                  title="Eliminar asset"
                  aria-label={`Eliminar ${asset.name}`}
                  onClick={() => onRemoveAsset(asset.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyAssets}>
            {activeTab === "all"
              ? "Importa archivos para comenzar"
              : `Sin archivos de ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase()}`}
          </p>
        )}
      </div>
    </section>
  );
}
