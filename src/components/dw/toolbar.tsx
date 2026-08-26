import { ArrowRight, CirclePlay, Clapperboard, File, Pencil } from "lucide-react"
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
  directorModeEnabled: boolean
  directorModeDisabled: boolean
  directorModeDisabledReason?: string
  onToggleDirectorMode: () => void
  onAction: () => void
}

export function Toolbar({
  action,
  hasContent,
  onOpenScriptEditor,
  directorModeEnabled,
  directorModeDisabled,
  directorModeDisabledReason,
  onToggleDirectorMode,
  onAction,
}: ToolbarProps) {
  const { t } = useTranslation()
  const directorModeLabel = directorModeEnabled
    ? t("app.disableDirectorMode")
    : t("app.enableDirectorMode")
  return (
    <div className="dw-toolbar">
      <div className="dw-toolbar-left">
        <button type="button" className="dw-pill-btn" onClick={onOpenScriptEditor}>
          {hasContent ? <Pencil size={14} strokeWidth={2} /> : <File size={14} strokeWidth={2} />}
          {t(hasContent ? "app.editProject" : "app.importScript")}
        </button>
        {hasContent && (
          <button
            type="button"
            className={`dw-pill-btn${directorModeEnabled ? " is-active" : ""}`}
            aria-label={directorModeLabel}
            aria-pressed={directorModeEnabled}
            disabled={directorModeDisabled}
            title={directorModeDisabled ? directorModeDisabledReason : directorModeLabel}
            onClick={onToggleDirectorMode}
          >
            <Clapperboard size={14} strokeWidth={2} />
            {t("app.directorMode")}
          </button>
        )}
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
