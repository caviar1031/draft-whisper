import { Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { AppIcon } from "./app-icon"

// 自定义顶栏 — 仅承载应用图标/名称 + 右侧设置/置顶
// 红黄绿按钮使用 macOS 原生 NSWindow 控件 (decorations:true + titleBarStyle:Overlay)
// 原生控件浮在 webview 之上，自带 hover 时的窗口操作面板（平铺/全屏等）
// 左侧 padding 预留约 80px 让出原生按钮空间
interface TitleBarProps {
  settingsOpen: boolean
  alwaysOnTop: boolean
  onToggleSettings: () => void
  onToggleAlwaysOnTop: () => void
}

export function TitleBar({
  settingsOpen,
  alwaysOnTop,
  onToggleSettings,
  onToggleAlwaysOnTop,
}: TitleBarProps) {
  const { t } = useTranslation()
  return (
    <div className="dw-title-bar" data-tauri-drag-region>
      <div className="dw-title-left">
        <div className="dw-title-app">
          <AppIcon />
          <span className="dw-app-name">DraftWhisper</span>
        </div>
      </div>

      <div className="dw-title-right">
        <button
          type="button"
          className={`dw-nav-btn${settingsOpen ? " is-active" : ""}`}
          aria-label={t("app.settings")}
          aria-pressed={settingsOpen}
          onClick={onToggleSettings}
        >
          <Settings size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`dw-toggle-pill${alwaysOnTop ? " is-active" : ""}`}
          aria-label={t("app.alwaysOnTop")}
          aria-pressed={alwaysOnTop}
          onClick={onToggleAlwaysOnTop}
        >
          <span className="dw-toggle-dot" />
        </button>
      </div>
    </div>
  )
}
