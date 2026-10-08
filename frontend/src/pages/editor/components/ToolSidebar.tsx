/**
 * ToolSidebar — Vertical sidebar with editing tools.
 * Active editor tools.
 */

import type { EditorTool } from "../types/editor.types";
import styles from "../EditorPage.module.css";

interface ToolSidebarProps {
  activeTool: EditorTool;
  onSetTool: (tool: EditorTool) => void;
}

interface ToolDef {
  id: EditorTool;
  icon: string;
  label: string;
}

const TOOLS: ToolDef[] = [
  { id: "select", icon: "V", label: "Select" },
  { id: "track", icon: "A", label: "Track" },
  { id: "ripple", icon: "B", label: "Ripple" },
  { id: "rolling", icon: "N", label: "Rolling" },
  { id: "rate", icon: "R", label: "Rate" },
  { id: "razor", icon: "C", label: "Razor" },
  { id: "slip", icon: "Y", label: "Slip" },
  { id: "slide", icon: "U", label: "Slide" },
  { id: "pen", icon: "P", label: "Pen" },
  { id: "hand", icon: "H", label: "Hand" },
  { id: "zoom", icon: "Z", label: "Zoom" },
];

export function ToolSidebar({ activeTool, onSetTool }: ToolSidebarProps) {
  return (
    <aside
      className={styles.toolSidebar}
      aria-label="Herramientas del editor"
      role="toolbar"
    >
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        const className = [
          styles.toolBtn,
          isActive ? styles.toolActive : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={tool.id}
            id={`editor-tool-${tool.id}`}
            type="button"
            className={className}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={isActive}
            onClick={() => onSetTool(tool.id)}
          >
            <span aria-hidden="true">{tool.icon}</span>
            <span className={styles.toolLabel}>{tool.label}</span>
          </button>
        );
      })}
    </aside>
  );
}
