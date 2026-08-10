import { Select } from "@/components/ui/select"
import { saveVoiceSample, testTts } from "@/services/tts"
import { useVoiceSampleStore } from "@/stores/voice-sample-store"
import type { ApiConfig, TtsMode } from "@/types"
import { PROVIDERS, TTS_MODES } from "@/utils/provider-catalog"
import { validateApiConfig } from "@/utils/settings-validation"
import { open } from "@tauri-apps/plugin-dialog"
import { Check, CircleAlert, ExternalLink, Eye, EyeOff, RefreshCw, Upload, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

type TestStatus = { state: "idle" | "testing" | "success" | "error"; error?: string }

interface ApiConfigEditorProps {
  config: ApiConfig
  isNew: boolean
  existingApiKey: string
  onCancel: () => void
  onSave: (config: ApiConfig, apiKey?: string) => Promise<void>
}

const IDLE_TESTS: Record<TtsMode, TestStatus> = {
  basic: { state: "idle" },
  "voice-design": { state: "idle" },
  "voice-clone": { state: "idle" },
}

export function ApiConfigEditor({
  config,
  isNew,
  existingApiKey,
  onCancel,
  onSave,
}: ApiConfigEditorProps) {
  const { t } = useTranslation()
  const samples = useVoiceSampleStore((state) => state.samples)
  const addSample = useVoiceSampleStore((state) => state.addSample)
  const [draft, setDraft] = useState<ApiConfig>(() => structuredClone(config))
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [cloneSamplePath, setCloneSamplePath] = useState("")
  const [tests, setTests] = useState<Record<TtsMode, TestStatus>>(IDLE_TESTS)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const effectiveApiKey = apiKey.trim() || existingApiKey
  const provider = PROVIDERS[draft.provider]
  const enabledCount = useMemo(
    () => TTS_MODES.filter((mode) => draft.capabilities[mode].enabled).length,
    [draft.capabilities],
  )

  const invalidateAllTests = () => {
    setTests(IDLE_TESTS)
    setDraft((current) => ({
      ...current,
      capabilities: Object.fromEntries(
        TTS_MODES.map((mode) => [mode, { ...current.capabilities[mode], lastVerifiedAt: null }]),
      ) as ApiConfig["capabilities"],
    }))
  }

  const updateCapability = (
    mode: TtsMode,
    updates: Partial<ApiConfig["capabilities"][TtsMode]>,
  ) => {
    setDraft((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        [mode]: { ...current.capabilities[mode], ...updates, lastVerifiedAt: null },
      },
    }))
    setTests((current) => ({ ...current, [mode]: { state: "idle" } }))
  }

  const handleTest = async (mode: TtsMode) => {
    const mapping = draft.capabilities[mode]
    if (!effectiveApiKey) {
      setTests((current) => ({
        ...current,
        [mode]: { state: "error", error: t("settings.errors.apiKeyRequired") },
      }))
      return
    }
    if (!mapping.modelId.trim()) {
      setTests((current) => ({
        ...current,
        [mode]: { state: "error", error: t("settings.errors.modelRequired") },
      }))
      return
    }
    if (mode === "voice-clone" && !cloneSamplePath) {
      setTests((current) => ({
        ...current,
        [mode]: { state: "error", error: t("settings.editor.sampleRequired") },
      }))
      return
    }

    setDraft((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        [mode]: { ...current.capabilities[mode], lastVerifiedAt: null },
      },
    }))
    setTests((current) => ({ ...current, [mode]: { state: "testing" } }))
    try {
      await testTts({
        provider: draft.provider,
        baseUrl: draft.baseUrl,
        apiKey: effectiveApiKey,
        model: mapping.modelId.trim(),
        mode,
        voice: "冰糖",
        voiceDesignPrompt: mode === "voice-design" ? "A warm, calm and natural voice." : "",
        voiceClonePath: mode === "voice-clone" ? cloneSamplePath : null,
        performancePrompt: "",
      })
      const verifiedAt = Date.now()
      setDraft((current) => ({
        ...current,
        capabilities: {
          ...current.capabilities,
          [mode]: { ...current.capabilities[mode], lastVerifiedAt: verifiedAt },
        },
      }))
      setTests((current) => ({ ...current, [mode]: { state: "success" } }))
    } catch (error) {
      setTests((current) => ({
        ...current,
        [mode]: { state: "error", error: error instanceof Error ? error.message : String(error) },
      }))
    }
  }

  const handleImportSample = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Voice Clone Audio", extensions: ["wav", "mp3"] }],
    })
    if (!selected || typeof selected !== "string") return
    const sampleId = `settings_${Date.now().toString(36)}`
    try {
      const stored = await saveVoiceSample(selected, sampleId)
      const filename =
        selected
          .split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "") || sampleId
      addSample({
        id: sampleId,
        name: filename,
        filePath: stored.filePath,
        createdAt: Date.now(),
        format: stored.format,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        encodedSize: stored.encodedSize,
        durationMs: stored.durationMs,
        source: "uploaded",
      })
      setCloneSamplePath(stored.filePath)
    } catch (error) {
      setTests((current) => ({
        ...current,
        "voice-clone": {
          state: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      }))
    }
  }

  const handleSave = async () => {
    const errorKey = validateApiConfig(draft)
    if (errorKey) {
      setFormError(t(errorKey))
      return
    }
    if (isNew && !apiKey.trim()) {
      setFormError(t("settings.errors.apiKeyRequired"))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await onSave({ ...draft, name: draft.name.trim(), baseUrl: draft.baseUrl.trim() }, apiKey)
    } catch (error) {
      setFormError(error instanceof Error ? t(error.message) : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dw-dim-overlay" role="presentation">
      <dialog className="dw-api-editor" open aria-labelledby="api-editor-title">
        <header className="dw-api-editor-header">
          <div>
            <h2 id="api-editor-title">
              {t(isNew ? "settings.editor.addTitle" : "settings.editor.editTitle")}
            </h2>
            <p>{provider.name}</p>
          </div>
          <button
            type="button"
            className="dw-settings-close"
            onClick={onCancel}
            aria-label={t("common.close")}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="dw-api-editor-body">
          <div className="dw-api-editor-grid">
            <label className="dw-settings-label">
              {t("settings.editor.name")}
              <input
                className="dw-settings-input"
                value={draft.name}
                placeholder={t("settings.editor.namePlaceholder")}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <div className="dw-settings-label">
              {t("settings.editor.provider")}
              <Select
                value={draft.provider}
                ariaLabel={t("settings.editor.provider")}
                options={[{ value: draft.provider, label: provider.name }]}
                onValueChange={() => undefined}
                disabled
              />
            </div>
          </div>

          <label className="dw-settings-label">
            {t("settings.editor.baseUrl")}
            <input
              className="dw-settings-input"
              type="url"
              value={draft.baseUrl}
              onChange={(event) => {
                setDraft((current) => ({ ...current, baseUrl: event.target.value }))
                invalidateAllTests()
              }}
            />
          </label>

          <div className="dw-field-label-row">
            <label className="dw-settings-label" htmlFor="api-editor-key">
              {t("settings.editor.apiKey")}
            </label>
            <a
              className="dw-settings-doc-link"
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("settings.editor.docs")}
              <ExternalLink size={11} strokeWidth={2} />
            </a>
          </div>
          <div className="dw-secret-input-wrap">
            <input
              id="api-editor-key"
              className="dw-settings-input"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              placeholder={t(
                isNew
                  ? "settings.editor.apiKeyNewPlaceholder"
                  : "settings.editor.apiKeyEditPlaceholder",
              )}
              onChange={(event) => {
                setApiKey(event.target.value)
                invalidateAllTests()
              }}
            />
            <button
              type="button"
              className="dw-secret-toggle"
              onClick={() => setShowApiKey((visible) => !visible)}
              aria-label={t(showApiKey ? "settings.editor.hideKey" : "settings.editor.showKey")}
            >
              {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <div className="dw-api-editor-section-title">
            <strong>{t("settings.editor.capabilityTitle")}</strong>
            <span>{t("settings.editor.capabilityDesc")}</span>
          </div>

          <div className="dw-api-capabilities">
            {TTS_MODES.map((mode) => {
              const mapping = draft.capabilities[mode]
              const status = tests[mode]
              return (
                <div
                  className={`dw-api-capability${mapping.enabled ? " is-enabled" : ""}`}
                  key={mode}
                >
                  <div className="dw-api-capability-header">
                    <label className="dw-switch-label">
                      <input
                        type="checkbox"
                        checked={mapping.enabled}
                        onChange={(event) =>
                          updateCapability(mode, { enabled: event.target.checked })
                        }
                      />
                      <span className="dw-mini-switch" />
                      <strong>{t(`settings.modes.${mode}`)}</strong>
                    </label>
                    {mapping.lastVerifiedAt && (
                      <span className="dw-verified-time">
                        <Check size={11} /> {new Date(mapping.lastVerifiedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {mapping.enabled && (
                    <>
                      <div className="dw-api-model-row">
                        <input
                          className="dw-settings-input"
                          aria-label={`${t(`settings.modes.${mode}`)} ${t("settings.editor.modelId")}`}
                          value={mapping.modelId}
                          onChange={(event) =>
                            updateCapability(mode, { modelId: event.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="dw-pill-btn"
                          onClick={() => void handleTest(mode)}
                          disabled={status.state === "testing"}
                        >
                          {status.state === "testing" ? (
                            <RefreshCw size={12} className="dw-spinner" />
                          ) : status.state === "success" ? (
                            <Check size={12} />
                          ) : status.state === "error" ? (
                            <CircleAlert size={12} />
                          ) : null}
                          {t(status.state === "testing" ? "common.testing" : "common.test")}
                        </button>
                      </div>
                      {mode === "voice-clone" && (
                        <div className="dw-clone-test-row">
                          <Select
                            value={cloneSamplePath}
                            ariaLabel={t("settings.editor.selectSample")}
                            className="is-flexible"
                            options={[
                              { value: "", label: t("settings.editor.selectSample") },
                              ...samples.map((sample) => ({
                                value: sample.filePath,
                                label: sample.name,
                              })),
                            ]}
                            onValueChange={setCloneSamplePath}
                          />
                          <button
                            type="button"
                            className="dw-pill-btn"
                            onClick={() => void handleImportSample()}
                          >
                            <Upload size={12} /> {t("settings.editor.importSample")}
                          </button>
                        </div>
                      )}
                      {status.state === "success" && (
                        <span className="dw-test-result is-success">
                          {t("settings.editor.testSuccess")}
                        </span>
                      )}
                      {status.state === "error" && (
                        <span className="dw-test-result is-error">
                          {t("settings.editor.testFailed", { error: status.error })}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {formError && (
            <div className="dw-settings-inline-error" role="alert">
              <CircleAlert size={13} /> {formError}
            </div>
          )}
        </div>

        <footer className="dw-api-editor-footer">
          <span>{t("settings.capabilities", { count: enabledCount })}</span>
          <div>
            <button type="button" className="dw-pill-btn" onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="dw-primary-btn"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </footer>
      </dialog>
    </div>
  )
}
