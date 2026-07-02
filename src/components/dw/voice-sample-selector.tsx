import { deleteVoiceSample, readAudioAsUrl, saveVoiceSample } from "@/services/tts"
import { useVoiceSampleStore } from "@/stores/voice-sample-store"
import { open } from "@tauri-apps/plugin-dialog"
import { Check, Mic, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

interface VoiceSampleSelectorProps {
  selectedPath: string | null
  onSelect: (path: string | null) => void
}

function generateSampleId(): string {
  const rand = Math.random().toString(36).substring(2, 8)
  return `vs_${rand}`
}

export function VoiceSampleSelector({ selectedPath, onSelect }: VoiceSampleSelectorProps) {
  const { samples, addSample, removeSample, renameSample } = useVoiceSampleStore()
  const [managing, setManaging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [pendingSourcePath, setPendingSourcePath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select()
  }, [renamingId])

  const handleAdd = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "ogg", "flac", "aac"] }],
    })
    if (!selected || typeof selected !== "string") return
    const filePath = selected

    // 提取文件名（不含扩展名）作为默认名称
    const basename = filePath.split("/").pop() ?? filePath
    const defaultName = basename.replace(/\.[^.]+$/, "")
    setNewName(defaultName)
    setPendingSourcePath(filePath)
    setAdding(true)
    setTimeout(() => nameInputRef.current?.select(), 50)
  }, [])

  const handleSaveSample = useCallback(async () => {
    if (!pendingSourcePath || !newName.trim()) return
    setSaving(true)
    try {
      const sampleId = generateSampleId()
      const storedPath = await saveVoiceSample(pendingSourcePath, sampleId)
      addSample({
        id: sampleId,
        name: newName.trim(),
        filePath: storedPath,
        createdAt: Date.now(),
      })
      onSelect(storedPath)
      setAdding(false)
      setPendingSourcePath(null)
      setNewName("")
    } catch (e) {
      console.error("保存音色样本失败:", e)
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
      try {
        await deleteVoiceSample(filePath)
      } catch {
        // 文件可能已不存在，仍然清理元数据
      }
      removeSample(sampleId)
      if (selectedPath === filePath) {
        onSelect(null)
      }
    },
    [removeSample, selectedPath, onSelect],
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
        const url = await readAudioAsUrl(filePath)
        const audio = new Audio(url)
        audioRef.current = audio
        setPlayingId(sampleId)
        audio.onended = () => setPlayingId(null)
        audio.onerror = () => setPlayingId(null)
        await audio.play()
      } catch (e) {
        console.error("播放样本失败:", e)
        setPlayingId(null)
      }
    },
    [playingId],
  )

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
      <label className="dw-settings-label">
        Voice Sample
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            className="dw-settings-select"
            style={{ flex: 1 }}
            value={selectedPath ?? ""}
            onChange={(e) => onSelect(e.target.value || null)}
          >
            <option value="">
              {samples.length === 0 ? "No samples — add one first" : "Select a sample..."}
            </option>
            {samples.map((s) => (
              <option key={s.id} value={s.filePath}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="dw-pill-btn" onClick={handleAdd}>
            <Plus size={14} strokeWidth={2} />
            Add
          </button>
          {samples.length > 0 && (
            <button
              type="button"
              className={`dw-pill-btn ${managing ? "is-active" : ""}`}
              onClick={() => setManaging(!managing)}
            >
              <Mic size={14} strokeWidth={2} />
              Manage
            </button>
          )}
        </div>
      </label>

      {/* 新增样本：名称输入 */}
      {adding && (
        <div className="dw-sample-add-row" onKeyDown={handleAddKeyDown}>
          <span className="dw-sample-add-label">Name</span>
          <input
            ref={nameInputRef}
            className="dw-sample-name-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="My Voice"
            maxLength={40}
          />
          <button
            type="button"
            className="dw-pill-btn"
            onClick={handleSaveSample}
            disabled={saving || !newName.trim()}
          >
            <Check size={14} strokeWidth={2} />
            {saving ? "Saving..." : "Save"}
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
                  <button
                    type="button"
                    className="dw-pill-btn"
                    onClick={() => handlePreview(s.id, s.filePath)}
                    title={playingId === s.id ? "Stop" : "Preview"}
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
                    title="Rename"
                  >
                    <Pencil size={12} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="dw-pill-btn"
                    onClick={() => handleDelete(s.id, s.filePath)}
                    title="Delete"
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
            ? `Using: ${selectedSample.name}`
            : "Add a voice sample to use Voice Clone mode"}
        </span>
      </div>
    </div>
  )
}
