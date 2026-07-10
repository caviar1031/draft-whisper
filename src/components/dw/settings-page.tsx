import { listModels, testTts } from "@/services/tts"
import { useSettingsStore } from "@/stores/settings-store"
import type { ModelConfig, TtsMode } from "@/types"
import { inferTtsMode } from "@/types"
import { Download, Plus, RefreshCw, X } from "lucide-react"
import { useCallback, useState } from "react"

type TestState = "idle" | "testing" | "success" | "error"

export function SettingsPage() {
  const settings = useSettingsStore()
  const [testState, setTestState] = useState<TestState>("idle")
  const [testError, setTestError] = useState<string | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [addingManual, setAddingManual] = useState(false)
  const [manualId, setManualId] = useState("")
  const [manualMode, setManualMode] = useState<TtsMode>("basic")

  const handleTest = useCallback(async () => {
    setTestState("testing")
    setTestError(null)
    try {
      await settings.flushApiKey()
      const firstModel = settings.models.find((m) => m.mode === "basic")
      await testTts({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: firstModel?.id ?? "mimo-v2.5-tts",
        mode: "basic",
        voice: "冰糖",
        voiceDesignPrompt: "",
        voiceClonePath: null,
      })
      setTestState("success")
    } catch (error) {
      setTestState("error")
      setTestError(error instanceof Error ? error.message : String(error))
    }
  }, [settings])

  const handleFetchModels = useCallback(async () => {
    if (!settings.baseUrl.trim() || !settings.apiKey.trim()) return
    setFetchingModels(true)
    setFetchError(null)
    try {
      const ids = await listModels(settings.baseUrl, settings.apiKey)
      const existingIds = new Set(settings.models.map((m) => m.id))
      for (const id of ids) {
        if (existingIds.has(id)) continue
        settings.addModel({
          id,
          name: id,
          mode: inferTtsMode(id),
        })
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetchingModels(false)
    }
  }, [settings])

  const handleAddManual = useCallback(() => {
    const id = manualId.trim()
    if (!id) return
    if (settings.models.some((m) => m.id === id)) return
    settings.addModel({ id, name: id, mode: manualMode })
    setManualId("")
    setManualMode("basic")
    setAddingManual(false)
  }, [manualId, manualMode, settings])

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

      {/* API 配置 */}
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
          placeholder={settings.apiKeyLoaded ? "sk-..." : "Loading from Keychain…"}
          value={settings.apiKey}
          onChange={(e) => settings.setApiKey(e.target.value)}
          onBlur={() => void settings.flushApiKey().catch(() => {})}
          disabled={!settings.apiKeyLoaded}
        />
        {settings.apiKeySaveState !== "idle" && (
          <span
            className={`dw-settings-save-state is-${settings.apiKeySaveState}`}
            role={settings.apiKeySaveState === "error" ? "alert" : undefined}
          >
            {settings.apiKeySaveState === "pending" && "Waiting to save…"}
            {settings.apiKeySaveState === "saving" && "Saving to Keychain…"}
            {settings.apiKeySaveState === "saved" && "Saved to Keychain"}
            {settings.apiKeySaveState === "error" &&
              (settings.apiKeySaveError ?? "Could not save to Keychain")}
          </span>
        )}
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
      {testError && (
        <div className="dw-settings-inline-error" role="alert" title={testError}>
          {testError}
        </div>
      )}

      {/* 模型管理 */}
      <div className="dw-models-section">
        <div className="dw-models-header">
          <span className="dw-settings-label" style={{ marginBottom: 0 }}>
            Models
          </span>
          <div className="dw-models-actions">
            <button
              type="button"
              className="dw-pill-btn"
              onClick={handleFetchModels}
              disabled={fetchingModels || !settings.baseUrl.trim() || !settings.apiKey.trim()}
              title="Fetch models from API"
            >
              {fetchingModels ? (
                <RefreshCw size={12} strokeWidth={2} className="dw-spinner" />
              ) : (
                <Download size={12} strokeWidth={2} />
              )}
              API
            </button>
            <button
              type="button"
              className="dw-pill-btn"
              onClick={() => setAddingManual(true)}
              title="Add model manually"
            >
              <Plus size={12} strokeWidth={2} />
              Add
            </button>
          </div>
        </div>

        {fetchError && (
          <div className="dw-editing-hint" style={{ color: "var(--state-error)" }}>
            <span>{fetchError}</span>
          </div>
        )}

        {/* 模型列表 */}
        {settings.models.length > 0 ? (
          <div className="dw-model-list">
            {settings.models.map((m) => (
              <ModelItem key={m.id} model={m} />
            ))}
          </div>
        ) : (
          !addingManual && (
            <div className="dw-editing-hint">
              <span>No models configured. Fetch from API or add manually.</span>
            </div>
          )
        )}

        {/* 手动添加 */}
        {addingManual && (
          <div className="dw-manual-add">
            <input
              className="dw-settings-input"
              type="text"
              placeholder="Model ID (e.g. mimo-v2.5-tts)"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddManual()
                if (e.key === "Escape") setAddingManual(false)
              }}
            />
            <select
              className="dw-settings-select"
              value={manualMode}
              onChange={(e) => setManualMode(e.target.value as TtsMode)}
            >
              <option value="basic">Basic</option>
              <option value="voice-design">Voice Design</option>
              <option value="voice-clone">Voice Clone</option>
            </select>
            <div className="dw-models-actions">
              <button
                type="button"
                className="dw-primary-btn"
                onClick={handleAddManual}
                disabled={!manualId.trim()}
                style={{ height: 28, fontSize: 12 }}
              >
                Add
              </button>
              <button
                type="button"
                className="dw-pill-btn"
                onClick={() => {
                  setAddingManual(false)
                  setManualId("")
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ModelItem({ model }: { model: ModelConfig }) {
  const removeModel = useSettingsStore((s) => s.removeModel)
  const updateModel = useSettingsStore((s) => s.updateModel)

  return (
    <div className="dw-model-item">
      <div className="dw-model-info">
        <span className="dw-model-name">{model.name}</span>
        <select
          className="dw-model-mode-select"
          value={model.mode}
          onChange={(e) => updateModel(model.id, { mode: e.target.value as TtsMode })}
        >
          <option value="basic">Basic</option>
          <option value="voice-design">Design</option>
          <option value="voice-clone">Clone</option>
        </select>
      </div>
      <button
        type="button"
        className="dw-model-remove"
        onClick={() => removeModel(model.id)}
        title="Remove model"
      >
        <X size={12} strokeWidth={2} />
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
