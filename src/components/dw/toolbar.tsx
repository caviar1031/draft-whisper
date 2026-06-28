import { formatSpeed, voiceLabel } from "@/lib/options"
import {
  ArrowRight,
  ChevronDown,
  ChevronsUpDown,
  CirclePlay,
  File,
  Pencil,
  User,
} from "lucide-react"

// 工具栏主操作类型 — 不同视图状态显示不同按钮
export type ToolbarAction =
  | { kind: "generate"; disabled?: boolean }
  | { kind: "regenerate-all" }
  | { kind: "regenerate-selected"; disabled?: boolean }

interface ToolbarProps {
  voice: string
  speed: number
  action: ToolbarAction
  editMode?: boolean
  onImportScript: () => void
  onToggleEdit?: () => void
  onVoiceClick: () => void
  onSpeedClick: () => void
  onAction: () => void
}

export function Toolbar({
  voice,
  speed,
  action,
  editMode = false,
  onImportScript,
  onToggleEdit,
  onVoiceClick,
  onSpeedClick,
  onAction,
}: ToolbarProps) {
  return (
    <div className="dw-toolbar">
      <div className="dw-toolbar-left">
        <button type="button" className="dw-pill-btn" onClick={onImportScript}>
          <File size={14} strokeWidth={2} />
          Import Script
        </button>
        {onToggleEdit && (
          <button
            type="button"
            className={`dw-pill-btn${editMode ? " is-active" : ""}`}
            onClick={onToggleEdit}
          >
            <Pencil size={14} strokeWidth={2} />
            Edit
          </button>
        )}
      </div>
      <div className="dw-toolbar-right">
        <button type="button" className="dw-pill-select" onClick={onVoiceClick}>
          <User size={14} strokeWidth={2} />
          {voiceLabel(voice)}
          <ChevronDown size={10} strokeWidth={2} />
        </button>
        <button type="button" className="dw-pill-select" onClick={onSpeedClick}>
          <ChevronsUpDown size={14} strokeWidth={2} />
          {formatSpeed(speed)}
          <ChevronDown size={10} strokeWidth={2} />
        </button>
        <ActionButton action={action} onAction={onAction} />
      </div>
    </div>
  )
}

function ActionButton({
  action,
  onAction,
}: {
  action: ToolbarAction
  onAction: () => void
}) {
  if (action.kind === "generate") {
    return (
      <button
        type="button"
        className="dw-primary-btn"
        onClick={onAction}
        disabled={action.disabled}
      >
        <CirclePlay size={14} strokeWidth={2} />
        Generate All
      </button>
    )
  }
  if (action.kind === "regenerate-all") {
    return (
      <button
        type="button"
        className="dw-pill-btn"
        onClick={onAction}
        style={{ color: "var(--text-500)" }}
      >
        <ArrowRight size={14} strokeWidth={2} />
        Regenerate All
      </button>
    )
  }
  // regenerate-selected
  return (
    <button type="button" className="dw-primary-btn" onClick={onAction} disabled={action.disabled}>
      <ArrowRight size={14} strokeWidth={2} />
      Regenerate
    </button>
  )
}
