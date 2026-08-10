import { ModalLayer } from "@/components/ui/modal-layer"
import { Select } from "@/components/ui/select"
import { saveVoiceSample, testTts } from "@/services/tts"
import { useVoiceSampleStore } from "@/stores/voice-sample-store"
import type { ApiConfig, ProviderId, TtsMode } from "@/types"
import { PROVIDERS, TTS_MODES, applyProviderPreset } from "@/utils/provider-catalog"
import { validateApiConfig } from "@/utils/settings-validation"
import { open } from "@tauri-apps/plugin-dialog"
import { openUrl } from "@tauri-apps/plugin-opener"
import {
  Check,
  CircleAlert,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react"
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
  const [providerChanged, setProviderChanged] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [cloneSamplePath, setCloneSamplePath] = useState("")
  const [tests, setTests] = useState<Record<TtsMode, TestStatus>>(IDLE_TESTS)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const effectiveApiKey = apiKey.trim() || (providerChanged ? "" : existingApiKey)
  const provider = PROVIDERS[draft.provider]
  const providerLabel = t(`settings.providers.${draft.provider}`)
  const enabledCount = useMemo(
    () => TTS_MODES.filter((mode) => draft.capabilities[mode].enabled).length,
    [draft.capabilities],
  )

  const invalidateAllTests = () => setTests(IDLE_TESTS)

  const updateCapability = (
    mode: TtsMode,
    updates: Partial<ApiConfig["capabilities"][TtsMode]>,
  ) => {
    setDraft((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        [mode]: { ...current.capabilities[mode], ...updates },
      },
    }))
    setTests((current) => ({ ...current, [mode]: { state: "idle" } }))
  }

  const handleProviderChange = (providerId: ProviderId) => {
    setDraft((current) => applyProviderPreset(current, providerId))
    setProviderChanged(providerId !== config.provider)
    setApiKey("")
    setCloneSamplePath("")
    setTests(IDLE_TESTS)
    setDocsError(null)
    setFormError(null)
  }

  const updateVoice = (index: number, field: "id" | "name", value: string) => {
    setDraft((current) => ({
      ...current,
      voices: current.voices.map((voice, voiceIndex) =>
        voiceIndex === index ? { ...voice, [field]: value } : voice,
      ),
    }))
    invalidateAllTests()
  }

  const addVoice = () => {
    setDraft((current) => ({
      ...current,
      voices: [...current.voices, { id: "", name: "" }],
    }))
    invalidateAllTests()
  }

  const removeVoice = (index: number) => {
    setDraft((current) => ({
      ...current,
      voices: current.voices.filter((_, voiceIndex) => voiceIndex !== index),
    }))
    invalidateAllTests()
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
    if (mode === "basic" && !draft.voices.some((voice) => voice.id.trim())) {
      setTests((current) => ({
        ...current,
        [mode]: { state: "error", error: t("settings.errors.voiceRequired") },
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

    setTests((current) => ({ ...current, [mode]: { state: "testing" } }))
    try {
      await testTts({
        provider: draft.provider,
        baseUrl: draft.baseUrl,
        apiKey: effectiveApiKey,
        model: mapping.modelId.trim(),
        mode,
        voice: draft.voices[0]?.id.trim() ?? "",
        voiceDesignPrompt: mode === "voice-design" ? "A warm, calm and natural voice." : "",
        voiceClonePath: mode === "voice-clone" ? cloneSamplePath : null,
        performancePrompt: "",
      })
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

  const handleOpenDocs = async () => {
    if (!provider.docsUrl) return
    setDocsError(null)
    try {
      await openUrl(provider.docsUrl)
    } catch (error) {
      console.error("Failed to open provider documentation", error)
      setDocsError(t("settings.editor.docsOpenFailed"))
    }
  }

  const handleSave = async () => {
    const errorKey = validateApiConfig(draft)
    if (errorKey) {
      setFormError(t(errorKey))
      return
    }
    if ((isNew || providerChanged) && !apiKey.trim()) {
      setFormError(t("settings.errors.apiKeyRequired"))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await onSave(
        {
          ...draft,
          name: draft.name.trim(),
          baseUrl: draft.baseUrl.trim(),
          voices: draft.voices.map((voice) => ({
            id: voice.id.trim(),
            name: voice.name.trim(),
          })),
        },
        apiKey,
      )
    } catch (error) {
      setFormError(error instanceof Error ? t(error.message) : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalLayer onClose={onCancel}>
      <ModalLayer.Panel className="dw-api-editor" aria-labelledby="api-editor-title">
        <header className="dw-api-editor-header">
          <div>
            <h2 id="api-editor-title">
              {t(isNew ? "settings.editor.addTitle" : "settings.editor.editTitle")}
            </h2>
            <p>{providerLabel}</p>
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
                options={Object.values(PROVIDERS).map((definition) => ({
                  value: definition.id,
                  label: t(`settings.providers.${definition.id}`),
                }))}
                onValueChange={handleProviderChange}
              />
            </div>
          </div>

          <label className="dw-settings-label">
            {t(
              draft.provider === "custom"
                ? "settings.editor.endpointUrl"
                : "settings.editor.baseUrl",
            )}
            <input
              className="dw-settings-input"
              type="url"
              value={draft.baseUrl}
              onChange={(event) => {
                setDraft((current) => ({ ...current, baseUrl: event.target.value }))
                invalidateAllTests()
              }}
            />
            {draft.provider === "custom" && (
              <span className="dw-settings-field-hint">
                {t("settings.editor.customProtocolHint")}
              </span>
            )}
          </label>

          <div className="dw-field-label-row">
            <label className="dw-settings-label" htmlFor="api-editor-key">
              {t("settings.editor.apiKey")}
            </label>
            {provider.docsUrl && (
              <button
                type="button"
                className="dw-settings-doc-link"
                onClick={() => void handleOpenDocs()}
              >
                {t("settings.editor.docs")}
                <ExternalLink size={11} strokeWidth={2} />
              </button>
            )}
          </div>
          {docsError && (
            <div className="dw-settings-inline-error" role="alert">
              <CircleAlert size={13} /> {docsError}
            </div>
          )}
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

          <div className="dw-api-editor-section-title dw-api-voices-heading">
            <div>
              <strong>{t("settings.editor.voicesTitle")}</strong>
              <span>{t("settings.editor.voicesDesc")}</span>
            </div>
            <button type="button" className="dw-pill-btn" onClick={addVoice}>
              <Plus size={12} /> {t("settings.editor.addVoice")}
            </button>
          </div>

          <div className="dw-api-voice-list">
            {draft.voices.map((voice, index) => (
              <div
                className="dw-api-voice-row"
                key={
                  // biome-ignore lint/suspicious/noArrayIndexKey: voice rows only change through explicit add/remove actions
                  index
                }
              >
                <input
                  className="dw-settings-input"
                  aria-label={t("settings.editor.voiceName")}
                  placeholder={t("settings.editor.voiceName")}
                  value={voice.name}
                  onChange={(event) => updateVoice(index, "name", event.target.value)}
                />
                <input
                  className="dw-settings-input"
                  aria-label={t("settings.editor.voiceId")}
                  placeholder={t("settings.editor.voiceId")}
                  value={voice.id}
                  onChange={(event) => updateVoice(index, "id", event.target.value)}
                />
                <button
                  type="button"
                  className="dw-icon-action is-danger"
                  aria-label={t("settings.editor.removeVoice")}
                  onClick={() => removeVoice(index)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="dw-api-editor-section-title">
            <strong>{t("settings.editor.capabilityTitle")}</strong>
            <span>{t("settings.editor.capabilityDesc")}</span>
          </div>

          <div className="dw-api-capabilities">
            {TTS_MODES.map((mode) => {
              const mapping = draft.capabilities[mode]
              const status = tests[mode]
              const supported = provider.supportedModes.includes(mode)
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
                        disabled={!supported}
                        onChange={(event) =>
                          updateCapability(mode, { enabled: event.target.checked })
                        }
                      />
                      <span className="dw-mini-switch" />
                      <strong>{t(`settings.modes.${mode}`)}</strong>
                      {!supported && (
                        <span className="dw-api-unsupported">
                          {t("settings.editor.unsupported")}
                        </span>
                      )}
                    </label>
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
      </ModalLayer.Panel>
    </ModalLayer>
  )
}
