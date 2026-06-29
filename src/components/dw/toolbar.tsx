import { formatSpeed, voiceLabel, VOICE_OPTIONS, SPEED_OPTIONS } from "@/lib/options"
import {
  ArrowRight,
  ChevronDown,
  ChevronsUpDown,
  CirclePlay,
  File,
  Pencil,
  User,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

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
  onVoiceChange: (voice: string) => void
  onSpeedChange: (speed: number) => void
  onAction: () => void
}

export function Toolbar({
  voice,
  speed,
  action,
  editMode = false,
  onImportScript,
  onToggleEdit,
  onVoiceChange,
  onSpeedChange,
  onAction,
}: ToolbarProps) {
  const [openDropdown, setOpenDropdown] = useState<"voice" | "speed" | null>(null)
  const voiceRef = useRef<HTMLDivElement>(null)
  const speedRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback((which: "voice" | "speed") => {
    setOpenDropdown((prev) => (prev === which ? null : which))
  }, [])

  useEffect(() => {
    if (!openDropdown) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        (openDropdown === "voice" && voiceRef.current?.contains(target)) ||
        (openDropdown === "speed" && speedRef.current?.contains(target))
      ) return
      setOpenDropdown(null)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [openDropdown])

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
        <div className="dw-select-wrapper" ref={voiceRef}>
          <button type="button" className="dw-pill-select" onClick={() => toggle("voice")}>
            <User size={14} strokeWidth={2} />
            {voiceLabel(voice)}
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          {openDropdown === "voice" && (
            <div className="dw-select-dropdown">
              {VOICE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={`dw-select-option${opt.value === voice ? " is-active" : ""}`}
                  onClick={() => { onVoiceChange(opt.value); setOpenDropdown(null) }}
                >
                  <span>{opt.label}</span>
                  {opt.desc && <span className="dw-select-desc">{opt.desc}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dw-select-wrapper" ref={speedRef}>
          <button type="button" className="dw-pill-select" onClick={() => toggle("speed")}>
            <ChevronsUpDown size={14} strokeWidth={2} />
            {formatSpeed(speed)}
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          {openDropdown === "speed" && (
            <div className="dw-select-dropdown">
              {SPEED_OPTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={`dw-select-option${s === speed ? " is-active" : ""}`}
                  onClick={() => { onSpeedChange(s); setOpenDropdown(null) }}
                >
                  {formatSpeed(s)}
                </button>
              ))}
            </div>
          )}
        </div>
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
