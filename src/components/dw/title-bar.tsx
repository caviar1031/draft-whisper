import { registerTauriListener } from "@/utils/tauri-listener"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Settings } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AppIcon } from "./app-icon"

// 跨平台标题栏：macOS 保留原生交通灯，Windows 使用与系统视觉一致的自绘标题按钮。
// macOS 原生控件浮在 webview 之上，左侧 padding 会预留约 80px。
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
  const isWindows = document.documentElement.dataset.platform === "windows"
  const [isMaximized, setIsMaximized] = useState(false)
  const [isWindowFocused, setIsWindowFocused] = useState(true)

  useEffect(() => {
    if (!isWindows) return

    const appWindow = getCurrentWindow()
    let disposed = false

    const syncMaximized = () => {
      void appWindow
        .isMaximized()
        .then((maximized) => {
          if (!disposed) setIsMaximized(maximized)
        })
        .catch(() => undefined)
    }

    syncMaximized()
    const unregisterResize = registerTauriListener(() => appWindow.onResized(syncMaximized))
    const unregisterFocus = registerTauriListener(() =>
      appWindow.onFocusChanged(({ payload: focused }) => {
        if (!disposed) setIsWindowFocused(focused)
      }),
    )

    return () => {
      disposed = true
      unregisterResize()
      unregisterFocus()
    }
  }, [isWindows])

  const minimizeWindow = () => {
    void getCurrentWindow()
      .minimize()
      .catch(() => undefined)
  }

  const toggleMaximizeWindow = () => {
    const appWindow = getCurrentWindow()
    void appWindow
      .toggleMaximize()
      .then(() => appWindow.isMaximized())
      .then(setIsMaximized)
      .catch(() => undefined)
  }

  const closeWindow = () => {
    void getCurrentWindow()
      .close()
      .catch(() => undefined)
  }

  return (
    <div className={`dw-title-bar${!isWindowFocused ? " is-inactive" : ""}`}>
      <div className="dw-title-left" data-tauri-drag-region>
        <div className="dw-title-app">
          {isWindows ? (
            <img className="dw-windows-app-icon" src="/favicon.png" alt="" />
          ) : (
            <AppIcon />
          )}
          <span className="dw-app-name" data-tauri-drag-region>
            DraftWhisper
          </span>
        </div>
      </div>

      <div className="dw-title-right">
        <div className="dw-title-actions">
          <button
            type="button"
            className={`dw-nav-btn${settingsOpen ? " is-active" : ""}`}
            aria-label={t("app.settings")}
            title={t("app.settings")}
            aria-pressed={settingsOpen}
            onClick={onToggleSettings}
          >
            <Settings size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`dw-toggle-pill${alwaysOnTop ? " is-active" : ""}`}
            aria-label={t("app.alwaysOnTop")}
            title={t("app.alwaysOnTop")}
            aria-pressed={alwaysOnTop}
            onClick={onToggleAlwaysOnTop}
          >
            <span className="dw-toggle-dot" />
          </button>
        </div>

        {isWindows && (
          <div className="dw-windows-caption-controls">
            <button
              type="button"
              className="dw-windows-caption-button"
              aria-label={t("app.minimize")}
              title={t("app.minimize")}
              onClick={minimizeWindow}
            >
              <span className="dw-windows-caption-glyph" aria-hidden="true">
                {"\uE921"}
              </span>
            </button>
            <button
              type="button"
              className="dw-windows-caption-button"
              aria-label={t(isMaximized ? "app.restore" : "app.maximize")}
              title={t(isMaximized ? "app.restore" : "app.maximize")}
              onClick={toggleMaximizeWindow}
            >
              <span className="dw-windows-caption-glyph" aria-hidden="true">
                {isMaximized ? "\uE923" : "\uE922"}
              </span>
            </button>
            <button
              type="button"
              className="dw-windows-caption-button is-close"
              aria-label={t("common.close")}
              title={t("common.close")}
              onClick={closeWindow}
            >
              <span className="dw-windows-caption-glyph" aria-hidden="true">
                {"\uE8BB"}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
