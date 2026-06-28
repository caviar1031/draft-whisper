import { PenLine } from "lucide-react"
import type { ReactNode } from "react"
import { AppIcon } from "./app-icon"

// macOS 桌面壁纸 + Liquid Glass 窗口外框
interface WindowShellProps {
  children: ReactNode
}

export function WindowShell({ children }: WindowShellProps) {
  return (
    <div className="dw-page-bg dw-desktop-bg">
      <div className="draftwhisper-window">{children}</div>
    </div>
  )
}

// 顶部导航栏 (48px)
interface NavBarProps {
  settingsOpen: boolean
  alwaysOnTop: boolean
  onToggleSettings: () => void
  onToggleAlwaysOnTop: () => void
}

export function NavBar({
  settingsOpen,
  alwaysOnTop,
  onToggleSettings,
  onToggleAlwaysOnTop,
}: NavBarProps) {
  return (
    <div className="dw-nav-bar">
      <div className="dw-nav-left">
        <AppIcon />
        <span className="dw-app-name">DraftWhisper</span>
      </div>
      <div className="dw-nav-right">
        <button
          type="button"
          className={`dw-nav-btn${settingsOpen ? " is-active" : ""}`}
          aria-label="Settings"
          aria-pressed={settingsOpen}
          onClick={onToggleSettings}
        >
          <PenLine size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`dw-toggle-pill${alwaysOnTop ? " is-active" : ""}`}
          aria-label="Always on top"
          aria-pressed={alwaysOnTop}
          onClick={onToggleAlwaysOnTop}
        >
          <span className="dw-toggle-dot" />
        </button>
      </div>
    </div>
  )
}

// 底部状态栏 (28px)
interface StatusBarProps {
  count: number
  statusText: string
  statusTone?: "default" | "ready" | "generating" | "error" | "pending"
}

export function StatusBar({ count, statusText, statusTone = "default" }: StatusBarProps) {
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

  return (
    <div className="dw-status-bar">
      <span className="dw-status-bar-text">
        {count} {count === 1 ? "sentence" : "sentences"}
      </span>
      <span className="dw-status-bar-text" style={toneColor ? { color: toneColor } : undefined}>
        {statusText}
      </span>
    </div>
  )
}
