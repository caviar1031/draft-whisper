import { ArrowRight, CirclePlay, File, Pencil } from "lucide-react"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()
  return (
    <div className="dw-toolbar">
      <div className="dw-toolbar-left">
        <button type="button" className="dw-pill-btn" onClick={onOpenScriptEditor}>
          {hasContent ? <Pencil size={14} strokeWidth={2} /> : <File size={14} strokeWidth={2} />}
          {t(hasContent ? "app.editProject" : "app.importScript")}
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
  const { t } = useTranslation()
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
        {t("app.generateAll")}
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
      {t("app.regenerateAll")}
    </button>
  )
}
