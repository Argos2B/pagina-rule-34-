import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject, ReactNode } from "react";
import type { EditorProject } from "../types/editor.types";
import styles from "../EditorPage.module.css";

export type ViewportZoom = number | "fit";

interface ProjectCanvasProps {
  project: EditorProject;
  zoom: ViewportZoom;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  children?: ReactNode;
}

function getProjectDimensions(project: EditorProject) {
  const width = Math.max(1, Math.round(project.settings.width));
  const height = Math.max(1, Math.round(project.settings.height));
  return {
    width,
    height,
    aspectRatio: width / height,
  };
}

export function ProjectCanvas({ project, zoom, canvasRef, children }: ProjectCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const projectSize = getProjectDimensions(project);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const visualSize = useMemo(() => {
    const availableWidth = Math.max(viewportSize.width - 32, 1);
    const availableHeight = Math.max(viewportSize.height - 32, 1);
    const fitScale = Math.min(availableWidth / projectSize.width, availableHeight / projectSize.height);
    const scale = zoom === "fit" ? fitScale : zoom / 100;

    return {
      width: Math.max(1, Math.round(projectSize.width * scale)),
      height: Math.max(1, Math.round(projectSize.height * scale)),
      scale,
    };
  }, [projectSize.height, projectSize.width, viewportSize.height, viewportSize.width, zoom]);

  return (
    <div
      className={styles.projectCanvasViewport}
      ref={viewportRef}
      data-project-width={projectSize.width}
      data-project-height={projectSize.height}
      data-project-aspect={projectSize.aspectRatio.toFixed(6)}
    >
      <div className={styles.projectCanvasCenter}>
        <div
          className={styles.projectCanvasFrame}
          style={{ width: visualSize.width, height: visualSize.height }}
          data-visual-width={visualSize.width}
          data-visual-height={visualSize.height}
          data-viewport-zoom={zoom === "fit" ? "fit" : `${zoom}`}
          data-viewport-scale={visualSize.scale.toFixed(6)}
        >
          <canvas
            ref={canvasRef}
            width={projectSize.width}
            height={projectSize.height}
            className={styles.projectCanvasElement}
            aria-label={`${projectSize.width} by ${projectSize.height} project canvas`}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
