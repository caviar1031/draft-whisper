import { ArrowRight, CirclePlay, File, Pencil } from "lucide-react"

// 工具栏主操作类型
export type ToolbarAction = {
  kind: "generate" | "regenerate-all"
  disabled?: boolean
  disabledReason?: string
}

interface ToolbarProps {
  action: ToolbarAction
  hasContent: boolean
  onOpenScriptEditor: () => void
  onAction: () => void
}

export function Toolbar({ action, hasContent, onOpenScriptEditor, onAction }: ToolbarProps) {
  return (
    <div className="dw-toolbar">
      <div className="dw-toolbar-left">
        <button type="button" className="dw-pill-btn" onClick={onOpenScriptEditor}>
          {hasContent ? <Pencil size={14} strokeWidth={2} /> : <File size={14} strokeWidth={2} />}
          {hasContent ? "Edit Project" : "Import Script"}
        </button>
      </div>
      <div className="dw-toolbar-right">
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
        title={action.disabledReason}
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
      disabled={action.disabled}
      title={action.disabledReason}
      style={{ color: "var(--text-500)" }}
    >
      <ArrowRight size={14} strokeWidth={2} />
      Regenerate All
    </button>
  )
}
