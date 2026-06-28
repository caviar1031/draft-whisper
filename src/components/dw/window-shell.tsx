import type { ReactNode } from "react"

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
