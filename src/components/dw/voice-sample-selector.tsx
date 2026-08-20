import { Select } from "@/components/ui/select"
import {
  cleanupAudioFiles,
  deleteVoiceSample,
  readAudioAsUrl,
  saveVoiceSample,
} from "@/services/audio"
import { previewVoiceClone } from "@/services/tts"
import { clearVoiceSampleReferences } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useVoiceSampleStore } from "@/stores/voice-sample-store"
import { open } from "@tauri-apps/plugin-dialog"
import {
  Check,
  Mic,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface VoiceSampleSelectorProps {
  selectedPath: string | null
  onSelect: (path: string | null) => void
  model: string
  apiConfigId: string | null
  performancePrompt: string
}

function generateSampleId(): string {
  const rand = Math.random().toString(36).substring(2, 8)
  return `vs_${rand}`
}

function isSupportedSamplePath(path: string): boolean {
  return /\.(wav|mp3)$/i.test(path)
}

export function VoiceSampleSelector({
  selectedPath,
  onSelect,
  model,
  apiConfigId,
  performancePrompt,
}: VoiceSampleSelectorProps) {
  const { t } = useTranslation()
  const { samples, addSample, removeSample, renameSample } = useVoiceSampleStore()
  const apiConfig = useSettingsStore((state) =>
    state.apiConfigs.find((config) => config.id === apiConfigId),
  )
  const apiKey = useSettingsStore((state) => (apiConfigId ? state.apiKeys[apiConfigId] : ""))
  const baseUrl = apiConfig?.baseUrl ?? ""
  const [managing, setManaging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [pendingSourcePath, setPendingSourcePath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState(() => t("samples.defaultPreview"))
  const [previewing, setPreviewing] = useState(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewPathRef = useRef<string | null>(null)
  const previewRequestRef = useRef(0)
  const disposedRef = useRef(false)
  const previewConfigurationKey = [
    selectedPath ?? "",
    performancePrompt,
    previewText,
    model,
    baseUrl,
    apiKey,
  ].join("\u0000")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select()
  }, [renamingId])

  useEffect(() => {
    if (selectedPath && !isSupportedSamplePath(selectedPath)) {
      onSelect(null)
      setErrorMessage(t("samples.unsupported"))
    }
  }, [onSelect, selectedPath, t])

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      audioRef.current?.pause()
      if (previewPathRef.current) cleanupAudioFiles([previewPathRef.current])
    }
  }, [])

  useEffect(() => {
    // 试听输入或连接配置变化后，旧试听不再代表当前配置。
    void previewConfigurationKey
    previewRequestRef.current += 1
    setPreviewing(false)
    const stalePreviewPath = previewPathRef.current
    if (!stalePreviewPath) return

    audioRef.current?.pause()
    audioRef.current = null
    setPlayingId(null)
    previewPathRef.current = null
    setPreviewPath(null)
    cleanupAudioFiles([stalePreviewPath])
  }, [previewConfigurationKey])

  const handleAdd = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Voice Clone Audio", extensions: ["wav", "mp3"] }],
    })
    if (!selected || typeof selected !== "string") return
    const filePath = selected

    // 提取文件名（不含扩展名）作为默认名称
    const basename = filePath.split("/").pop() ?? filePath
    const defaultName = basename.replace(/\.[^.]+$/, "")
    setNewName(defaultName)
    setPendingSourcePath(filePath)
    setAdding(true)
    setErrorMessage(null)
    setTimeout(() => nameInputRef.current?.select(), 50)
  }, [])

  const handleSaveSample = useCallback(async () => {
    if (!pendingSourcePath || !newName.trim()) return
    setSaving(true)
    try {
      const sampleId = generateSampleId()
      const stored = await saveVoiceSample(pendingSourcePath, sampleId)
      addSample({
        id: sampleId,
        name: newName.trim(),
        filePath: stored.filePath,
        createdAt: Date.now(),
        format: stored.format,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        encodedSize: stored.encodedSize,
        durationMs: stored.durationMs,
        source: "uploaded",
      })
      onSelect(stored.filePath)
      setAdding(false)
      setPendingSourcePath(null)
      setNewName("")
      setErrorMessage(null)
    } catch (e) {
      console.error("保存音色样本失败:", e)
      setErrorMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [pendingSourcePath, newName, addSample, onSelect])

  const handleCancelAdd = useCallback(() => {
    setAdding(false)
    setPendingSourcePath(null)
    setNewName("")
  }, [])

  const handleDelete = useCallback(
    async (sampleId: string, filePath: string) => {
      if (!window.confirm(t("samples.deleteConfirm"))) return
      try {
        await deleteVoiceSample(filePath)
      } catch {
        // 文件可能已不存在，仍然清理元数据
      }
      removeSample(sampleId)
      clearVoiceSampleReferences(filePath)
      if (selectedPath === filePath) {
        onSelect(null)
      }
      setErrorMessage(null)
    },
    [removeSample, selectedPath, onSelect, t],
  )

  const handleStartRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }, [])

  const handleConfirmRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameSample(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue("")
  }, [renamingId, renameValue, renameSample])

  const handlePreview = useCallback(
    async (sampleId: string, filePath: string) => {
      if (playingId === sampleId) {
        audioRef.current?.pause()
        audioRef.current = null
        setPlayingId(null)
        return
      }
      try {
        setErrorMessage(null)
        audioRef.current?.pause()
        const url = await readAudioAsUrl(filePath)
        const audio = new Audio(url)
        audioRef.current = audio
        setPlayingId(sampleId)
        audio.onended = () => setPlayingId(null)
        audio.onerror = () => setPlayingId(null)
        await audio.play()
      } catch (e) {
        console.error("播放样本失败:", e)
        setErrorMessage(e instanceof Error ? e.message : String(e))
        setPlayingId(null)
      }
    },
    [playingId],
  )

  const handleClonePreview = useCallback(async () => {
    if (!selectedPath || !previewText.trim()) return
    const requestId = ++previewRequestRef.current
    setPreviewing(true)
    setErrorMessage(null)
    try {
      audioRef.current?.pause()
      const result = await previewVoiceClone(previewText.trim(), {
        provider: apiConfig?.provider ?? "mimo",
        baseUrl,
        apiKey,
        model,
        mode: "voice-clone",
        voice: "",
        voiceDesignPrompt: "",
        voiceClonePath: selectedPath,
        performancePrompt,
      })
      if (disposedRef.current || previewRequestRef.current !== requestId) {
        cleanupAudioFiles([result.audioPath])
        return
      }
      if (previewPathRef.current) cleanupAudioFiles([previewPathRef.current])
      previewPathRef.current = result.audioPath
      setPreviewPath(result.audioPath)
      const url = await readAudioAsUrl(result.audioPath)
      const audio = new Audio(url)
      audioRef.current = audio
      setPlayingId("__clone_preview__")
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => setPlayingId(null)
      await audio.play()
    } catch (error) {
      if (!disposedRef.current && previewRequestRef.current === requestId) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
        setPlayingId(null)
      }
    } finally {
      if (!disposedRef.current && previewRequestRef.current === requestId) setPreviewing(false)
    }
  }, [apiConfig?.provider, apiKey, baseUrl, model, performancePrompt, previewText, selectedPath])

  const handlePlayGeneratedPreview = useCallback(async () => {
    if (!previewPath) return
    if (playingId === "__clone_preview__") {
      audioRef.current?.pause()
      audioRef.current = null
      setPlayingId(null)
      return
    }
    try {
      audioRef.current?.pause()
      const url = await readAudioAsUrl(previewPath)
      const audio = new Audio(url)
      audioRef.current = audio
      setPlayingId("__clone_preview__")
      audio.onended = () => setPlayingId(null)
      audio.onerror = () => setPlayingId(null)
      await audio.play()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }, [playingId, previewPath])

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSaveSample()
      }
      if (e.key === "Escape") {
        e.preventDefault()
        handleCancelAdd()
      }
    },
    [handleSaveSample, handleCancelAdd],
  )

  const selectedSample = samples.find((s) => s.filePath === selectedPath)

  return (
    <div className="dw-settings-field">
      <div className="dw-settings-label">
        {t("samples.title")}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Select
            className="is-flexible"
            value={selectedPath ?? ""}
            ariaLabel={t("samples.title")}
            options={[
              {
                value: "",
                label: samples.length === 0 ? t("samples.empty") : t("samples.select"),
              },
              ...samples
                .filter((sample) => isSupportedSamplePath(sample.filePath))
                .map((sample) => ({ value: sample.filePath, label: sample.name })),
            ]}
            onValueChange={(value) => onSelect(value || null)}
          />
          <button type="button" className="dw-pill-btn" onClick={handleAdd}>
            <Plus size={14} strokeWidth={2} />
            {t("samples.add")}
          </button>
          {samples.length > 0 && (
            <button
              type="button"
              className={`dw-pill-btn ${managing ? "is-active" : ""}`}
              onClick={() => setManaging(!managing)}
            >
              <Mic size={14} strokeWidth={2} />
              {managing ? t("samples.done") : t("samples.manage")}
            </button>
          )}
        </div>
      </div>

      {/* 新增样本：名称输入 */}
      {adding && (
        <div className="dw-sample-add-row" onKeyDown={handleAddKeyDown}>
          <span className="dw-sample-add-label">{t("samples.name")}</span>
          <input
            ref={nameInputRef}
            className="dw-sample-name-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("samples.namePlaceholder")}
            maxLength={40}
          />
          <button
            type="button"
            className="dw-pill-btn"
            onClick={handleSaveSample}
            disabled={saving || !newName.trim()}
          >
            <Check size={14} strokeWidth={2} />
            {saving ? t("samples.saving") : t("samples.save")}
          </button>
          <button type="button" className="dw-pill-btn" onClick={handleCancelAdd}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* 管理面板 */}
      {managing && samples.length > 0 && (
        <div className="dw-sample-manage-list">
          {samples.map((s) => (
            <div key={s.id} className="dw-sample-item">
              {renamingId === s.id ? (
                <>
                  <input
                    ref={renameInputRef}
                    className="dw-sample-name-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={40}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmRename()
                      if (e.key === "Escape") setRenamingId(null)
                    }}
                  />
                  <button
                    type="button"
                    className="dw-pill-btn"
                    onClick={handleConfirmRename}
                    disabled={!renameValue.trim()}
                  >
                    <Check size={12} strokeWidth={2} />
                  </button>
                  <button type="button" className="dw-pill-btn" onClick={() => setRenamingId(null)}>
                    <X size={12} strokeWidth={2} />
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="dw-sample-name"
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                  </span>
                  <span className="dw-sample-meta">
                    {s.format?.toUpperCase() ?? t("samples.legacy")}
                    {s.byteSize ? ` · ${(s.byteSize / 1024 / 1024).toFixed(1)} MB` : ""}
                  </span>
                  <button
                    type="button"
                    className="dw-pill-btn"
                    onClick={() => handlePreview(s.id, s.filePath)}
                    title={playingId === s.id ? t("samples.stop") : t("samples.preview")}
                  >
                    {playingId === s.id ? (
                      <Square size={12} strokeWidth={2} />
                    ) : (
                      <Play size={12} strokeWidth={2} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="dw-pill-btn"
                    onClick={() => handleStartRename(s.id, s.name)}
                    title={t("samples.rename")}
                  >
                    <Pencil size={12} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="dw-pill-btn"
                    onClick={() => handleDelete(s.id, s.filePath)}
                    title={t("samples.delete")}
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="dw-editing-hint" style={{ marginTop: 4 }}>
        <span>
          {selectedSample
            ? `${t("samples.using", { name: selectedSample.name })}${selectedSample.format ? ` · ${selectedSample.format.toUpperCase()}` : ""}${selectedSample.encodedSize ? ` · Base64 ${(selectedSample.encodedSize / 1024 / 1024).toFixed(1)} MB` : ""}`
            : t("samples.formatHint")}
        </span>
      </div>

      {selectedPath && (
        <div className="dw-clone-preview-panel">
          <span className="dw-settings-label">{t("samples.clonePreview")}</span>
          <textarea
            className="dw-editor-textarea"
            value={previewText}
            onChange={(event) => setPreviewText(event.target.value)}
            placeholder={t("samples.previewPlaceholder")}
            maxLength={300}
          />
          <div className="dw-clone-preview-actions">
            <button
              type="button"
              className="dw-primary-btn"
              onClick={() => void handleClonePreview()}
              disabled={previewing || !previewText.trim() || !apiKey || !baseUrl}
            >
              <RefreshCw
                size={13}
                strokeWidth={2}
                className={previewing ? "dw-spinner" : undefined}
              />
              {previewing ? t("samples.generating") : t("samples.generate")}
            </button>
            {previewPath && (
              <button
                type="button"
                className="dw-pill-btn"
                onClick={() => void handlePlayGeneratedPreview()}
              >
                {playingId === "__clone_preview__" ? (
                  <Square size={12} strokeWidth={2} />
                ) : (
                  <Play size={12} strokeWidth={2} />
                )}
                {playingId === "__clone_preview__" ? t("samples.stop") : t("samples.replay")}
              </button>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="dw-settings-inline-error" role="alert">
          <TriangleAlert size={12} strokeWidth={2} />
          {errorMessage}
        </div>
      )}
    </div>
  )
}
