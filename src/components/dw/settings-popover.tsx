import { MODEL_OPTIONS, SPEED_OPTIONS, VOICE_OPTIONS } from "@/lib/options"
import { useSettingsStore } from "@/stores/settings-store"
import { RefreshCw, X } from "lucide-react"
import { useState } from "react"

// 测试 API 按钮的三种反馈态
type TestState = "idle" | "testing" | "success" | "error"

interface SettingsPopoverProps {
  onClose: () => void
}

export function SettingsPopover({ onClose }: SettingsPopoverProps) {
  const settings = useSettingsStore()
  const [testState, setTestState] = useState<TestState>("idle")

  const handleTest = () => {
    setTestState("testing")
    // 模拟一次 API 测试：800ms 后随机成功/失败
    window.setTimeout(() => {
      setTestState(Math.random() > 0.3 ? "success" : "error")
    }, 800)
  }

  const testLabel =
    testState === "testing"
      ? "Testing..."
      : testState === "success"
        ? "Connected"
        : testState === "error"
          ? "Failed — check settings"
          : "Test API"

  return (
    <>
      <button
        type="button"
        className="dw-dim-overlay"
        aria-label="Close settings"
        onClick={onClose}
      />
      <dialog open className="dw-settings-popover" aria-label="Settings">
        <div className="dw-settings-header">
          <span className="dw-settings-title">Settings</span>
          <button
            type="button"
            className="dw-settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <Field label="Base URL">
          <input
            className="dw-settings-input"
            type="url"
            placeholder="https://api.openai.com/v1"
            value={settings.baseUrl}
            onChange={(e) => settings.setBaseUrl(e.target.value)}
          />
        </Field>

        <Field label="API Key">
          <input
            className="dw-settings-input"
            type="password"
            placeholder="sk-..."
            value={settings.apiKey}
            onChange={(e) => settings.setApiKey(e.target.value)}
          />
        </Field>

        <Field label="Model">
          <select
            className="dw-settings-select"
            value={settings.model}
            onChange={(e) => settings.setModel(e.target.value)}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Voice">
          <select
            className="dw-settings-select"
            value={settings.voice}
            onChange={(e) => settings.setVoice(e.target.value)}
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Speed">
          <select
            className="dw-settings-select"
            value={String(settings.speed)}
            onChange={(e) => settings.setSpeed(Number(e.target.value))}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={String(s)}>
                {s.toFixed(s < 1 ? 2 : 1)}x
              </option>
            ))}
          </select>
        </Field>

        <button
          type="button"
          className={`dw-test-btn${testState !== "idle" ? ` is-${testState}` : ""}`}
          onClick={handleTest}
          disabled={testState === "testing"}
        >
          {testState === "testing" && (
            <RefreshCw size={14} strokeWidth={2} className="dw-spinner" />
          )}
          {testState === "success" && <span>✓ </span>}
          {testLabel}
        </button>
      </dialog>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dw-settings-field">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: children renders an associated form control */}
      <label className="dw-settings-label">
        {label}
        {children}
      </label>
    </div>
  )
}
