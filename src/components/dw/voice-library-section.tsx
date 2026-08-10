import { ModalLayer } from "@/components/ui/modal-layer"
import { Select } from "@/components/ui/select"
import {
  cleanupAudioFiles,
  deleteVoiceSample,
  previewVoice,
  readAudioAsUrl,
  saveVoiceSample,
} from "@/services/tts"
import { clearVoiceResourceReferences } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useVoiceDesignStore } from "@/stores/voice-design-store"
import { useVoiceSampleStore } from "@/stores/voice-sample-store"
import type { VoiceDesignPreset } from "@/types"
import { resolveCapability } from "@/utils/provider-catalog"
import { open } from "@tauri-apps/plugin-dialog"
import {
  CheckCircle2,
  CircleAlert,
  Edit3,
  Mic2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

function resourceId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function VoiceLibrarySection() {
  const { t } = useTranslation()
  const designs = useVoiceDesignStore((state) => state.designs)
  const saveDesign = useVoiceDesignStore((state) => state.saveDesign)
  const removeDesign = useVoiceDesignStore((state) => state.removeDesign)
  const samples = useVoiceSampleStore((state) => state.samples)
  const addSample = useVoiceSampleStore((state) => state.addSample)
  const removeSample = useVoiceSampleStore((state) => state.removeSample)
  const renameSample = useVoiceSampleStore((state) => state.renameSample)
  const [designEditor, setDesignEditor] = useState<VoiceDesignPreset | null>(null)
  const [sampleDraft, setSampleDraft] = useState<{ name: string; sourcePath: string } | null>(null)
  const [renameDraft, setRenameDraft] = useState<{ id: string; name: string } | null>(null)
  const [sampleError, setSampleError] = useState<string | null>(null)
  const [sampleSaving, setSampleSaving] = useState(false)
  const [playingPath, setPlayingPath] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = async (path: string) => {
    if (playingPath === path) {
      audioRef.current?.pause()
      setPlayingPath(null)
      return
    }
    try {
      audioRef.current?.pause()
      const audio = new Audio(await readAudioAsUrl(path))
      audioRef.current = audio
      setPlayingPath(path)
      audio.onended = () => setPlayingPath(null)
      audio.onerror = () => setPlayingPath(null)
      await audio.play()
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : String(error))
    }
  }

  const addDesign = () => {
    const now = Date.now()
    setDesignEditor({
      id: resourceId("design"),
      name: "",
      prompt: "",
      previewAudioPath: null,
      previewText: t("voiceLibrary.design.defaultPreview"),
      previewApiConfigId: useSettingsStore.getState().defaultApiConfigId,
      lastVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  const deleteDesign = (design: VoiceDesignPreset) => {
    if (!window.confirm(t("voiceLibrary.design.deleteConfirm", { name: design.name }))) return
    if (design.previewAudioPath) cleanupAudioFiles([design.previewAudioPath])
    clearVoiceResourceReferences("design", design.id)
    removeDesign(design.id)
  }

  const chooseSample = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "WAV / MP3", extensions: ["wav", "mp3"] }],
    })
    if (!selected || typeof selected !== "string") return
    const name =
      selected
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") ?? ""
    setSampleDraft({ name, sourcePath: selected })
    setSampleError(null)
  }

  const saveSample = async () => {
    if (!sampleDraft?.name.trim()) return
    setSampleError(null)
    setSampleSaving(true)
    try {
      const id = resourceId("sample")
      const saved = await saveVoiceSample(sampleDraft.sourcePath, id)
      addSample({
        id,
        name: sampleDraft.name.trim(),
        filePath: saved.filePath,
        createdAt: Date.now(),
        format: saved.format,
        mimeType: saved.mimeType,
        byteSize: saved.byteSize,
        encodedSize: saved.encodedSize,
        durationMs: saved.durationMs,
        source: "uploaded",
      })
      setSampleDraft(null)
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : String(error))
    } finally {
      setSampleSaving(false)
    }
  }

  const removeCloneSample = async (id: string, name: string, path: string) => {
    if (!window.confirm(t("voiceLibrary.clone.deleteConfirm", { name }))) return
    try {
      await deleteVoiceSample(path)
    } catch {
      // Missing cached files should not prevent metadata cleanup.
    }
    clearVoiceResourceReferences("clone", id, path)
    removeSample(id)
  }

  return (
    <>
      <section className="dw-settings-section" aria-labelledby="voice-design-library-title">
        <div className="dw-settings-section-heading dw-models-section-heading">
          <div>
            <h2 id="voice-design-library-title">{t("voiceLibrary.design.title")}</h2>
          </div>
          <button type="button" className="dw-primary-btn dw-add-model-btn" onClick={addDesign}>
            <Plus size={13} /> {t("voiceLibrary.design.add")}
          </button>
        </div>
        <div className="dw-resource-grid">
          {designs.length === 0 ? (
            <ResourceEmpty icon={<Sparkles size={18} />} text={t("voiceLibrary.design.empty")} />
          ) : (
            designs.map((design) => (
              <article className="dw-resource-card" key={design.id}>
                <div className="dw-resource-card-main">
                  <Sparkles size={16} />
                  <div>
                    <strong>{design.name}</strong>
                    <p title={design.prompt}>{design.prompt}</p>
                  </div>
                </div>
                <div className="dw-resource-actions">
                  {design.previewAudioPath && (
                    <button
                      type="button"
                      className="dw-icon-action"
                      onClick={() => void play(design.previewAudioPath!)}
                    >
                      {playingPath === design.previewAudioPath ? (
                        <Pause size={13} />
                      ) : (
                        <Play size={13} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="dw-icon-action"
                    onClick={() => setDesignEditor(structuredClone(design))}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    className="dw-icon-action is-danger"
                    onClick={() => deleteDesign(design)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="dw-settings-section" aria-labelledby="voice-clone-library-title">
        <div className="dw-settings-section-heading dw-models-section-heading">
          <div>
            <h2 id="voice-clone-library-title">{t("voiceLibrary.clone.title")}</h2>
          </div>
          <button
            type="button"
            className="dw-primary-btn dw-add-model-btn"
            onClick={() => void chooseSample()}
          >
            <Plus size={13} /> {t("voiceLibrary.clone.add")}
          </button>
        </div>
        {sampleError && (
          <div className="dw-settings-inline-error" role="alert">
            <CircleAlert size={13} /> {sampleError}
          </div>
        )}
        <div className="dw-resource-grid">
          {samples.length === 0 ? (
            <ResourceEmpty icon={<Mic2 size={18} />} text={t("voiceLibrary.clone.empty")} />
          ) : (
            samples.map((sample) => (
              <article className="dw-resource-card" key={sample.id}>
                <div className="dw-resource-card-main">
                  <Mic2 size={16} />
                  <div>
                    <strong>{sample.name}</strong>
                    <p>
                      {sample.format.toUpperCase()} · {(sample.byteSize / 1024 / 1024).toFixed(1)}{" "}
                      MB ·{" "}
                      {sample.durationMs === null
                        ? t("voiceLibrary.clone.legacy")
                        : `${(sample.durationMs / 1000).toFixed(1)} s`}
                    </p>
                  </div>
                </div>
                <div className="dw-resource-actions">
                  <button
                    type="button"
                    className="dw-icon-action"
                    onClick={() => void play(sample.filePath)}
                  >
                    {playingPath === sample.filePath ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button
                    type="button"
                    className="dw-icon-action"
                    onClick={() => setRenameDraft({ id: sample.id, name: sample.name })}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    className="dw-icon-action is-danger"
                    onClick={() => void removeCloneSample(sample.id, sample.name, sample.filePath)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {designEditor && (
        <VoiceDesignEditor
          design={designEditor}
          onCancel={() => setDesignEditor(null)}
          onSave={(design) => {
            const previous = designs.find((item) => item.id === design.id)
            if (
              previous?.previewAudioPath &&
              previous.previewAudioPath !== design.previewAudioPath
            ) {
              cleanupAudioFiles([previous.previewAudioPath])
            }
            saveDesign(design)
            setDesignEditor(null)
          }}
        />
      )}
      {sampleDraft && (
        <ModalLayer onClose={() => setSampleDraft(null)}>
          <ModalLayer.Panel
            className="dw-api-editor dw-resource-editor"
            aria-labelledby="sample-editor-title"
          >
            <header className="dw-api-editor-header">
              <h2 id="sample-editor-title">{t("voiceLibrary.clone.add")}</h2>
              <button
                type="button"
                className="dw-settings-close"
                onClick={() => setSampleDraft(null)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="dw-api-editor-body">
              <label className="dw-settings-label">
                {t("voiceLibrary.name")}
                <input
                  className="dw-settings-input"
                  value={sampleDraft.name}
                  onChange={(event) => setSampleDraft({ ...sampleDraft, name: event.target.value })}
                />
              </label>
              <div className="dw-resource-file-path">{sampleDraft.sourcePath}</div>
              <p className="dw-resource-rule">{t("voiceLibrary.clone.rules")}</p>
              {sampleError && <div className="dw-settings-inline-error">{sampleError}</div>}
            </div>
            <footer className="dw-api-editor-footer">
              <span />
              <div>
                <button type="button" className="dw-pill-btn" onClick={() => setSampleDraft(null)}>
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="dw-primary-btn"
                  disabled={sampleSaving || !sampleDraft.name.trim()}
                  onClick={() => void saveSample()}
                >
                  {t(sampleSaving ? "common.saving" : "common.save")}
                </button>
              </div>
            </footer>
          </ModalLayer.Panel>
        </ModalLayer>
      )}
      {renameDraft && (
        <ModalLayer onClose={() => setRenameDraft(null)}>
          <ModalLayer.Panel
            className="dw-api-editor dw-resource-editor"
            aria-labelledby="rename-sample-title"
          >
            <header className="dw-api-editor-header">
              <h2 id="rename-sample-title">{t("voiceLibrary.clone.rename")}</h2>
              <button
                type="button"
                className="dw-settings-close"
                onClick={() => setRenameDraft(null)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="dw-api-editor-body">
              <label className="dw-settings-label">
                {t("voiceLibrary.name")}
                <input
                  className="dw-settings-input"
                  value={renameDraft.name}
                  onChange={(event) => setRenameDraft({ ...renameDraft, name: event.target.value })}
                />
              </label>
            </div>
            <footer className="dw-api-editor-footer">
              <span />
              <div>
                <button type="button" className="dw-pill-btn" onClick={() => setRenameDraft(null)}>
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="dw-primary-btn"
                  disabled={!renameDraft.name.trim()}
                  onClick={() => {
                    renameSample(renameDraft.id, renameDraft.name.trim())
                    setRenameDraft(null)
                  }}
                >
                  {t("common.save")}
                </button>
              </div>
            </footer>
          </ModalLayer.Panel>
        </ModalLayer>
      )}
    </>
  )
}

function ResourceEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="dw-resource-empty">
      {icon}
      <span>{text}</span>
    </div>
  )
}

function VoiceDesignEditor({
  design,
  onCancel,
  onSave,
}: {
  design: VoiceDesignPreset
  onCancel: () => void
  onSave: (design: VoiceDesignPreset) => void
}) {
  const { t } = useTranslation()
  const settings = useSettingsStore()
  const [draft, setDraft] = useState(design)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const test = async () => {
    const config = settings.apiConfigs.find((item) => item.id === draft.previewApiConfigId)
    const capability = config ? resolveCapability(config, "voice-design") : null
    const key = config ? settings.apiKeys[config.id] : ""
    if (!config || !capability || !key) {
      setError(t("voiceLibrary.design.missingApi"))
      return
    }
    if (!draft.prompt.trim() || !draft.previewText.trim()) return
    setTesting(true)
    setError(null)
    try {
      const result = await previewVoice(draft.previewText.trim(), {
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: key,
        model: capability.modelId,
        mode: "voice-design",
        voice: "",
        voiceDesignPrompt: draft.prompt.trim(),
        voiceClonePath: null,
        performancePrompt: "",
      })
      if (draft.previewAudioPath && draft.previewAudioPath !== design.previewAudioPath) {
        cleanupAudioFiles([draft.previewAudioPath])
      }
      setDraft({ ...draft, previewAudioPath: result.audioPath, lastVerifiedAt: Date.now() })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setTesting(false)
    }
  }

  const update = (changes: Partial<VoiceDesignPreset>, invalidatesPreview = false) => {
    if (
      invalidatesPreview &&
      draft.previewAudioPath &&
      draft.previewAudioPath !== design.previewAudioPath
    ) {
      cleanupAudioFiles([draft.previewAudioPath])
    }
    setDraft({
      ...draft,
      ...changes,
      ...(invalidatesPreview ? { previewAudioPath: null, lastVerifiedAt: null } : {}),
      updatedAt: Date.now(),
    })
  }

  const playPreview = async () => {
    if (!draft.previewAudioPath) return
    if (playing) {
      previewAudioRef.current?.pause()
      setPlaying(false)
      return
    }
    try {
      const audio = new Audio(await readAudioAsUrl(draft.previewAudioPath))
      previewAudioRef.current = audio
      setPlaying(true)
      audio.onended = () => setPlaying(false)
      audio.onerror = () => setPlaying(false)
      await audio.play()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const handleCancel = () => {
    if (draft.previewAudioPath && draft.previewAudioPath !== design.previewAudioPath) {
      cleanupAudioFiles([draft.previewAudioPath])
    }
    onCancel()
  }

  return (
    <ModalLayer onClose={handleCancel}>
      <ModalLayer.Panel
        className="dw-api-editor dw-resource-editor"
        aria-labelledby="design-editor-title"
      >
        <header className="dw-api-editor-header">
          <h2 id="design-editor-title">{t("voiceLibrary.design.editorTitle")}</h2>
          <button type="button" className="dw-settings-close" onClick={handleCancel}>
            <X size={16} />
          </button>
        </header>
        <div className="dw-api-editor-body">
          <section
            className="dw-resource-editor-section"
            aria-labelledby="voice-design-section-title"
          >
            <h3 id="voice-design-section-title">{t("voiceLibrary.design.sectionTitle")}</h3>
            <label className="dw-settings-label">
              {t("voiceLibrary.name")}
              <input
                className="dw-settings-input"
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label className="dw-settings-label">
              {t("voiceLibrary.design.prompt")}
              <textarea
                className="dw-editor-textarea dw-resource-editor-textarea"
                value={draft.prompt}
                maxLength={500}
                onChange={(event) => update({ prompt: event.target.value }, true)}
              />
            </label>
          </section>
          <section
            className="dw-resource-editor-section"
            aria-labelledby="voice-preview-section-title"
          >
            <h3 id="voice-preview-section-title">{t("voiceLibrary.design.previewSectionTitle")}</h3>
            <div className="dw-settings-label">
              {t("editor.apiConfig")}
              <Select
                value={draft.previewApiConfigId ?? ""}
                ariaLabel={t("editor.apiConfig")}
                options={[
                  { value: "", label: t("editor.selectApiConfig") },
                  ...settings.apiConfigs.map((config) => ({
                    value: config.id,
                    label: config.name,
                  })),
                ]}
                onValueChange={(value) => update({ previewApiConfigId: value || null }, true)}
              />
            </div>
            <label className="dw-settings-label">
              {t("voiceLibrary.previewText")}
              <textarea
                className="dw-editor-textarea dw-resource-editor-textarea"
                value={draft.previewText}
                maxLength={200}
                onChange={(event) => update({ previewText: event.target.value }, true)}
              />
            </label>
            <div className="dw-preview-panel">
              <div className="dw-preview-panel-actions">
                <button
                  type="button"
                  className="dw-preview-generate-btn"
                  disabled={testing}
                  onClick={() => void test()}
                >
                  <Sparkles size={13} />
                  {testing ? t("common.testing") : t("voiceLibrary.design.test")}
                </button>
                {draft.previewAudioPath && (
                  <button
                    type="button"
                    className="dw-preview-play-btn"
                    onClick={() => void playPreview()}
                  >
                    {playing ? <Pause size={13} /> : <Play size={13} />}
                    {t(playing ? "sentence.pause" : "sentence.play")}
                  </button>
                )}
              </div>
              {draft.previewAudioPath && (
                <output className="dw-preview-ready">
                  <CheckCircle2 size={13} />
                  <span>{t("voiceLibrary.design.testSuccess")}</span>
                </output>
              )}
            </div>
          </section>
          {error && <div className="dw-settings-inline-error">{error}</div>}
        </div>
        <footer className="dw-api-editor-footer">
          <span />
          <div>
            <button type="button" className="dw-pill-btn" onClick={handleCancel}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="dw-primary-btn"
              disabled={!draft.name.trim() || !draft.prompt.trim()}
              onClick={() =>
                onSave({ ...draft, name: draft.name.trim(), prompt: draft.prompt.trim() })
              }
            >
              {t("common.save")}
            </button>
          </div>
        </footer>
      </ModalLayer.Panel>
    </ModalLayer>
  )
}
