import { VOICE_OPTIONS, voiceLabel } from "@/lib/options"
import { ArrowRight, ChevronDown, CirclePlay, File, Pencil, User } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

// 工具栏主操作类型 — 不同视图状态显示不同按钮
export type ToolbarAction =
  | { kind: "generate"; disabled?: boolean }
  | { kind: "regenerate-all" }

interface ToolbarProps {
  voice: string
  action: ToolbarAction
  hasContent: boolean
  onOpenScriptEditor: () => void
  onVoiceChange: (voice: string) => void
  onAction: () => void
}

export function Toolbar({
  voice,
  action,
  hasContent,
  onOpenScriptEditor,
  onVoiceChange,
  onAction,
}: ToolbarProps) {
  const [openDropdown, setOpenDropdown] = useState(false)
  const voiceRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    setOpenDropdown((prev) => !prev)
  }, [])

  useEffect(() => {
    if (!openDropdown) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (voiceRef.current?.contains(target)) return
      setOpenDropdown(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [openDropdown])

  return (
    <div className="dw-toolbar">
      <div className="dw-toolbar-left">
        <button type="button" className="dw-pill-btn" onClick={onOpenScriptEditor}>
          {hasContent ? <Pencil size={14} strokeWidth={2} /> : <File size={14} strokeWidth={2} />}
          {hasContent ? "Edit Script" : "Import Script"}
        </button>
      </div>
      <div className="dw-toolbar-right">
        <div className="dw-select-wrapper" ref={voiceRef}>
          <button type="button" className="dw-pill-select" onClick={toggle}>
            <User size={14} strokeWidth={2} />
            {voiceLabel(voice)}
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          {openDropdown && (
            <div className="dw-select-dropdown">
              {VOICE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={`dw-select-option${opt.value === voice ? " is-active" : ""}`}
                  onClick={() => {
                    onVoiceChange(opt.value)
                    setOpenDropdown(false)
                  }}
                >
                  <span>{opt.label}</span>
                  {opt.desc && <span className="dw-select-desc">{opt.desc}</span>}
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
  // regenerate-all
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
