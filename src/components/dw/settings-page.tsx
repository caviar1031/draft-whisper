import { testTts } from "@/services/tts"
import { useSettingsStore } from "@/stores/settings-store"
import { RefreshCw } from "lucide-react"
import { useCallback, useState } from "react"

// 测试 API 按钮的三种反馈态
type TestState = "idle" | "testing" | "success" | "error"

export function SettingsPage() {
  const settings = useSettingsStore()
  const [testState, setTestState] = useState<TestState>("idle")

  const handleTest = useCallback(async () => {
    setTestState("testing")
    try {
      await testTts({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        mode: "basic",
        voice: "冰糖",
        voiceDesignPrompt: "",
        voiceClonePath: null,
      })
      setTestState("success")
    } catch {
      setTestState("error")
    }
  }, [settings.baseUrl, settings.apiKey])

  const testLabel =
    testState === "testing"
      ? "Testing..."
      : testState === "success"
        ? "Connected"
        : testState === "error"
          ? "Failed — check settings"
          : "Test API"

  return (
    <div className="dw-settings-page" aria-label="Settings">
      <div className="dw-settings-header">
        <span className="dw-settings-title">Settings</span>
      </div>

      <Field label="Base URL">
        <input
          className="dw-settings-input"
          type="url"
          placeholder="https://api.xiaomimimo.com/v1"
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

      <Field label="Concurrency">
        <input
          className="dw-settings-input"
          type="number"
          min={1}
          max={20}
          value={settings.concurrency}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value))
            if (n >= 1 && n <= 20) settings.setConcurrency(n)
          }}
        />
      </Field>

      <button
        type="button"
        className={`dw-test-btn${testState !== "idle" ? ` is-${testState}` : ""}`}
        onClick={handleTest}
        disabled={testState === "testing"}
      >
        {testState === "testing" && <RefreshCw size={14} strokeWidth={2} className="dw-spinner" />}
        {testState === "success" && <span>✓ </span>}
        {testLabel}
      </button>
    </div>
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
