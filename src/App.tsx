import { EmptyState } from "@/components/dw/empty-state"
import { ImportDialog } from "@/components/dw/import-dialog"
import { type CardView, SentenceCard } from "@/components/dw/sentence-card"
import { SettingsPopover } from "@/components/dw/settings-popover"
import { TitleBar } from "@/components/dw/title-bar"
import { Toolbar, type ToolbarAction } from "@/components/dw/toolbar"
import { StatusBar, WindowShell } from "@/components/dw/window-shell"
import { SPEED_OPTIONS, VOICE_OPTIONS } from "@/lib/options"
import { generateSentenceAudio, readAudioAsUrl } from "@/services/tts"
import { useProjectStore } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { SentenceStatus } from "@/types"
import { splitTextToSentences } from "@/utils/sentence"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type Phase = "empty" | "imported" | "generating" | "complete"

function App() {
  const sentences = useProjectStore((s) => s.sentences)
  const setSentences = useProjectStore((s) => s.setSentences)
  const updateSentence = useProjectStore((s) => s.updateSentence)

  const voice = useSettingsStore((s) => s.voice)
  const speed = useSettingsStore((s) => s.speed)
  const setVoice = useSettingsStore((s) => s.setVoice)
  const setSpeed = useSettingsStore((s) => s.setSpeed)

  const [playingId, setPlayingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  const genRunId = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // 由句子状态派生的高层阶段
  const phase: Phase =
    sentences.length === 0
      ? "empty"
      : sentences.some((s) => s.status === "generating")
        ? "generating"
        : sentences.every((s) => s.status === "completed" || s.status === "failed")
          ? "complete"
          : "imported"

  const failedCount = sentences.filter((s) => s.status === "failed").length

  // --- 真实 TTS 生成 ---
  const runGeneration = useCallback(
    async (ids: string[]) => {
      const runId = ++genRunId.current
      const settings = useSettingsStore.getState()
      const params = {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        voice: settings.voice,
        speed: settings.speed,
      }
      for (const id of ids) {
        if (genRunId.current !== runId) return
        const sentence = useProjectStore.getState().sentences.find((s) => s.id === id)
        if (!sentence) continue
        updateSentence(id, { status: "generating" })
        try {
          const result = await generateSentenceAudio(id, sentence.text, params)
          if (genRunId.current !== runId) return
          updateSentence(id, { status: "completed", audioPath: result.audioPath })
        } catch {
          if (genRunId.current !== runId) return
          updateSentence(id, { status: "failed" })
        }
      }
    },
    [updateSentence],
  )

  // --- 导入 ---
  const handleOpenImport = useCallback(() => {
    setImportDialogOpen(true)
  }, [])

  const handleImport = useCallback(
    (text: string) => {
      const newSentences = splitTextToSentences(text)
      setSentences(newSentences)
      setImportDialogOpen(false)
      setPlayingId(null)
      setEditingId(null)
      setEditMode(false)
      // 切句完成后自动开始生成
      void runGeneration(newSentences.map((s) => s.id))
    },
    [setSentences, runGeneration],
  )

  const handleGenerateAll = useCallback(() => {
    void runGeneration(sentences.map((s) => s.id))
  }, [sentences, runGeneration])

  const handleRegenerateAll = useCallback(() => {
    void runGeneration(sentences.map((s) => s.id))
  }, [sentences, runGeneration])

  const handleRetryAll = useCallback(() => {
    void runGeneration(sentences.filter((s) => s.status === "failed").map((s) => s.id))
  }, [sentences, runGeneration])

  const handleRegenerateCard = useCallback(
    (id: string) => {
      void runGeneration([id])
    },
    [runGeneration],
  )

  // --- 真实音频播放 ---
  const handlePlay = useCallback(
    async (id: string) => {
      const sentence = useProjectStore.getState().sentences.find((s) => s.id === id)
      if (!sentence?.audioPath) return

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      try {
        const url = await readAudioAsUrl(sentence.audioPath)
        const audio = new Audio(url)
        audioRef.current = audio
        setPlayingId(id)

        audio.addEventListener("loadedmetadata", () => {
          updateSentence(id, { duration: audio.duration })
        })
        audio.addEventListener("ended", () => {
          setPlayingId(null)
          audioRef.current = null
        })
        audio.addEventListener("error", () => {
          setPlayingId(null)
          audioRef.current = null
        })

        await audio.play()
      } catch {
        setPlayingId(null)
      }
    },
    [updateSentence],
  )

  const handlePause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  // --- 编辑 ---
  const handleEditCard = useCallback((id: string) => {
    setEditingId(id)
  }, [])

  const handleCommitEdit = useCallback(
    (id: string, text: string) => {
      updateSentence(id, { text, status: "pending", audioPath: null, duration: null })
      setEditingId(null)
    },
    [updateSentence],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  // --- AlwaysOnTop ---
  const handleToggleAlwaysOnTop = useCallback(async () => {
    const newValue = !alwaysOnTop
    setAlwaysOnTop(newValue)
    try {
      const win = getCurrentWindow()
      await win.setAlwaysOnTop(newValue)
    } catch {
      // web dev 模式下忽略
    }
  }, [alwaysOnTop])

  // --- 语音/速度循环切换 ---
  const handleVoiceClick = useCallback(() => {
    const idx = VOICE_OPTIONS.findIndex((v) => v.value === voice)
    setVoice(VOICE_OPTIONS[(idx + 1) % VOICE_OPTIONS.length].value)
  }, [voice, setVoice])

  const handleSpeedClick = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(speed)
    setSpeed(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length])
  }, [speed, setSpeed])

  // --- 工具栏 ---
  const toolbarAction: ToolbarAction =
    phase === "complete"
      ? editMode
        ? { kind: "regenerate-selected", disabled: true }
        : { kind: "regenerate-all" }
      : { kind: "generate", disabled: phase === "empty" || phase === "generating" }

  const handleToolbarAction = useCallback(() => {
    if (toolbarAction.kind === "generate") handleGenerateAll()
    else if (toolbarAction.kind === "regenerate-all") handleRegenerateAll()
  }, [toolbarAction, handleGenerateAll, handleRegenerateAll])

  // --- 卡片视图 ---
  const cardView = useCallback(
    (sentenceId: string, status: SentenceStatus): CardView => {
      if (editingId === sentenceId) return "editing"
      if (status === "generating") return "generating"
      if (status === "failed") return "failed"
      if (status === "completed") return playingId === sentenceId ? "playing" : "ready"
      return "queued"
    },
    [editingId, playingId],
  )

  // --- 状态栏 ---
  const statusBar = (() => {
    const count = sentences.length
    if (phase === "empty") return { statusText: "Ready", statusTone: "default" as const }
    if (phase === "imported") return { statusText: "Ready", statusTone: "default" as const }
    if (phase === "generating") {
      const done = sentences.filter((s) => s.status === "completed" || s.status === "failed").length
      return {
        statusText: `Generating ${done} / ${count}...`,
        statusTone: "generating" as const,
      }
    }
    if (editingId !== null) return { statusText: "1 pending edit", statusTone: "pending" as const }
    if (failedCount > 0)
      return {
        statusText: `${failedCount} failed`,
        statusTone: "error" as const,
      }
    return { statusText: "All ready", statusTone: "ready" as const }
  })()

  return (
    <WindowShell>
      <TitleBar
        settingsOpen={settingsOpen}
        alwaysOnTop={alwaysOnTop}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
      />
      <Toolbar
        voice={voice}
        speed={speed}
        action={toolbarAction}
        editMode={editMode}
        onImportScript={handleOpenImport}
        onToggleEdit={phase === "complete" ? () => setEditMode((v) => !v) : undefined}
        onVoiceClick={handleVoiceClick}
        onSpeedClick={handleSpeedClick}
        onAction={handleToolbarAction}
      />

      {failedCount > 0 && (
        <div className="dw-retry-all-bar">
          <span className="dw-retry-all-label">
            <TriangleAlert size={14} strokeWidth={2} style={{ color: "var(--state-error)" }} />
            {failedCount} {failedCount === 1 ? "generation" : "generations"} failed
          </span>
          <button type="button" className="dw-retry-all-btn" onClick={handleRetryAll}>
            <RefreshCw size={14} strokeWidth={2} />
            Retry All
          </button>
        </div>
      )}

      {phase === "empty" ? (
        <EmptyState />
      ) : (
        <div className="sentence-list">
          {sentences.map((sentence, index) => (
            <SentenceCard
              key={sentence.id}
              sentence={sentence}
              index={index}
              view={cardView(sentence.id, sentence.status)}
              queuedLabel={phase === "imported" ? "Idle" : "Queued"}
              errorMessage={
                sentence.status === "failed" ? "Generation failed — check API settings" : undefined
              }
              onPlay={() => void handlePlay(sentence.id)}
              onPause={handlePause}
              onRegenerate={() => handleRegenerateCard(sentence.id)}
              onRetry={() => handleRegenerateCard(sentence.id)}
              onEdit={() => handleEditCard(sentence.id)}
              onCommitEdit={(text) => handleCommitEdit(sentence.id, text)}
              onCancelEdit={handleCancelEdit}
            />
          ))}
        </div>
      )}

      <StatusBar count={sentences.length} {...statusBar} />

      {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
      {importDialogOpen && (
        <ImportDialog onImport={handleImport} onClose={() => setImportDialogOpen(false)} />
      )}
    </WindowShell>
  )
}

export default App
