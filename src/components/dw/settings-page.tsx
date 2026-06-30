import { MODEL_OPTIONS } from "@/lib/options"
import { listModels, testTts } from "@/services/tts"
import { useSettingsStore } from "@/stores/settings-store"
import { Download, RefreshCw } from "lucide-react"
import { useCallback, useRef, useState } from "react"

// 测试 API 按钮的三种反馈态
type TestState = "idle" | "testing" | "success" | "error"

export function SettingsPage() {
  const settings = useSettingsStore()
  const [testState, setTestState] = useState<TestState>("idle")
  const [models, setModels] = useState<string[]>(MODEL_OPTIONS)
  const [modelsLoading, setModelsLoading] = useState(false)
  const fetchId = useRef(0)

  const handleFetchModels = useCallback(async () => {
    const { baseUrl, apiKey } = settings
    if (!baseUrl.trim() || !apiKey.trim()) return

    const id = ++fetchId.current
    setModelsLoading(true)

    try {
      const fetched = await listModels(baseUrl, apiKey)
      if (fetchId.current !== id) return
      setModels(fetched)
    } catch {
      if (fetchId.current !== id) return
      setModels(MODEL_OPTIONS)
    } finally {
      if (fetchId.current !== id) return
      setModelsLoading(false)
    }
  }, [settings.baseUrl, settings.apiKey])

  const handleTest = useCallback(async () => {
    setTestState("testing")
    try {
      await testTts({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        voice: settings.voice,
        speed: settings.speed,
      })
      setTestState("success")
    } catch {
      setTestState("error")
    }
  }, [settings.baseUrl, settings.apiKey, settings.model, settings.voice, settings.speed])

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
        <div className="dw-model-row">
          <select
            className="dw-settings-select"
            value={settings.model}
            onChange={(e) => settings.setModel(e.target.value)}
            disabled={modelsLoading}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {/* 当前值不在列表中时也显示 */}
            {!models.includes(settings.model) && (
              <option value={settings.model}>{settings.model}</option>
            )}
          </select>
          <button
            type="button"
            className="dw-fetch-models-btn"
            onClick={handleFetchModels}
            disabled={modelsLoading || !settings.baseUrl.trim() || !settings.apiKey.trim()}
            title="Fetch models from API"
          >
            {modelsLoading ? (
              <RefreshCw size={14} strokeWidth={2} className="dw-spinner" />
            ) : (
              <Download size={14} strokeWidth={2} />
            )}
          </button>
        </div>
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
