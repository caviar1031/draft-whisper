import { Folder } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

// 窗口外框 — 直接作为 Liquid Glass 卡片铺满视口
// macOS vibrancy 在 Rust setup 中通过 window-vibrancy 应用，透出桌面壁纸
interface WindowShellProps {
  children: ReactNode
}

export function WindowShell({ children }: WindowShellProps) {
  return <div className="draftwhisper-window">{children}</div>
}

// 底部状态栏 (28px)
interface StatusBarProps {
  count: number
  statusText: string
  statusTone?: "default" | "ready" | "generating" | "error" | "pending"
  project?: string | null
  onProjectClick?: () => void
}

export function StatusBar({
  count,
  statusText,
  statusTone = "default",
  project,
  onProjectClick,
}: StatusBarProps) {
  const { t } = useTranslation()
  const toneColor =
    statusTone === "ready"
      ? "var(--state-success)"
      : statusTone === "generating"
        ? "var(--brand-500)"
        : statusTone === "error"
          ? "var(--state-error)"
          : statusTone === "pending"
            ? "var(--glass-orange)"
            : undefined

  const showProject = project && project.trim() !== ""

  return (
    <div className="dw-status-bar">
      <span className="dw-status-bar-text">{t("app.sentenceCount", { count })}</span>
      <div className="dw-status-bar-right">
        <span className="dw-status-bar-text" style={toneColor ? { color: toneColor } : undefined}>
          {statusText}
        </span>
        {showProject && (
          <button
            type="button"
            className="dw-status-bar-project"
            onClick={onProjectClick}
            title={t("app.configureProject")}
          >
            <span className="dw-status-bar-project-name">{project}</span>
            <Folder size={14} strokeWidth={2} />
          </button>
        )}
        {!showProject && onProjectClick && (
          <button
            type="button"
            className="dw-status-bar-project"
            onClick={onProjectClick}
            title={t("app.configureProject")}
          >
            <Folder size={14} strokeWidth={2} />
            <span className="dw-status-bar-project-name">{t("app.selectProject")}</span>
          </button>
        )}
      </div>
    </div>
  )
}
