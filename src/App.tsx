import { EmptyState } from "@/components/dw/empty-state"
import { type CardView, SentenceCard } from "@/components/dw/sentence-card"
import { SettingsPopover } from "@/components/dw/settings-popover"
import { Toolbar, type ToolbarAction } from "@/components/dw/toolbar"
import { NavBar, StatusBar, WindowShell } from "@/components/dw/window-shell"
import { SPEED_OPTIONS, VOICE_OPTIONS } from "@/lib/options"
import { useProjectStore } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { SentenceStatus } from "@/types"
import { splitTextToSentences } from "@/utils/sentence"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

// 示例脚本 — 与设计稿示例句子保持一致的英文产品展示文案
const SAMPLE_SCRIPT =
  "Welcome to our product showcase. Today we're going to explore something truly remarkable. The design philosophy behind this product centers on simplicity and elegance. Every detail has been carefully considered to create a seamless user experience. From the moment you open the app, you'll notice the attention to craftsmanship. Let's walk through the key features together, step by step."

const FAILURE_RATE = 0.3
const GEN_DELAY_MIN = 500
const GEN_DELAY_MAX = 900
const PLAY_DURATION = 3000

type Phase = "empty" | "imported" | "generating" | "complete"

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

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
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  // 生成流程的运行令牌 — 新一轮开始时旧的循环会自行中止
  const genRunId = useRef(0)
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (playTimer.current) clearTimeout(playTimer.current)
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

  // 导入脚本 — 切分为句子并初始化为 pending
  const handleImportScript = useCallback(() => {
    setSentences(splitTextToSentences(SAMPLE_SCRIPT))
    setPlayingId(null)
    setEditingId(null)
    setEditMode(false)
  }, [setSentences])

  // 顺序模拟生成流程：逐句 generating → completed/failed
  const runGeneration = useCallback(
    async (ids: string[]) => {
      const runId = ++genRunId.current
      for (const id of ids) {
        if (genRunId.current !== runId) return
        updateSentence(id, { status: "generating" })
        await delay(randomBetween(GEN_DELAY_MIN, GEN_DELAY_MAX))
        if (genRunId.current !== runId) return
        const failed = Math.random() < FAILURE_RATE
        updateSentence(id, {
          status: failed ? "failed" : ("completed" as SentenceStatus),
          audioPath: failed ? null : `mock://${id}.wav`,
          duration: failed ? null : 3.2,
        })
      }
    },
    [updateSentence],
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

  // 播放控制 — mock 持续 3s 后自动停止
  const handlePlay = useCallback((id: string) => {
    setPlayingId(id)
    if (playTimer.current) clearTimeout(playTimer.current)
    playTimer.current = setTimeout(() => setPlayingId(null), PLAY_DURATION)
  }, [])

  const handlePause = useCallback(() => {
    if (playTimer.current) clearTimeout(playTimer.current)
    setPlayingId(null)
  }, [])

  // 编辑控制
  const handleEditCard = useCallback((id: string) => {
    setEditingId(id)
  }, [])

  const handleCommitEdit = useCallback(
    (id: string, text: string) => {
      updateSentence(id, { text })
      setEditingId(null)
    },
    [updateSentence],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  // 工具栏语音/速度循环切换（暂无下拉组件，点击循环演示）
  const handleVoiceClick = useCallback(() => {
    const idx = VOICE_OPTIONS.findIndex((v) => v.value === voice)
    setVoice(VOICE_OPTIONS[(idx + 1) % VOICE_OPTIONS.length].value)
  }, [voice, setVoice])

  const handleSpeedClick = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(speed)
    setSpeed(SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length])
  }, [speed, setSpeed])

  // 工具栏主操作随阶段变化
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

  // 句子卡片视图派生：状态 + 播放/编辑叠加
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

  // 状态栏文案与色调 — 与设计稿各状态保持一致
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
      <NavBar
        settingsOpen={settingsOpen}
        alwaysOnTop={alwaysOnTop}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        onToggleAlwaysOnTop={() => setAlwaysOnTop((v) => !v)}
      />
      <Toolbar
        voice={voice}
        speed={speed}
        action={toolbarAction}
        editMode={editMode}
        onImportScript={handleImportScript}
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
              onPlay={() => handlePlay(sentence.id)}
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
    </WindowShell>
  )
}

export default App
