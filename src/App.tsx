import { EmptyState } from "@/components/dw/empty-state"
import { ProjectConfigCard } from "@/components/dw/project-config-card"
import { ScriptEditor } from "@/components/dw/script-editor"
import { type CardView, SentenceCard } from "@/components/dw/sentence-card"
import { SettingsPage } from "@/components/dw/settings-page"
import { TitleBar } from "@/components/dw/title-bar"
import { Toolbar, type ToolbarAction } from "@/components/dw/toolbar"
import { StatusBar, WindowShell } from "@/components/dw/window-shell"
import { createProject, generateSentenceAudio, listProjects, readAudioAsUrl } from "@/services/tts"
import { useProjectStore } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { SentenceStatus } from "@/types"
import { generateSentenceId } from "@/utils/id"
import { splitTextToSentences } from "@/utils/sentence"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type Phase = "empty" | "imported" | "generating" | "complete"

function App() {
  const sentences = useProjectStore((s) => s.sentences)
  const setSentences = useProjectStore((s) => s.setSentences)
  const updateSentence = useProjectStore((s) => s.updateSentence)
  const switchAudioVersion = useProjectStore((s) => s.switchAudioVersion)
  const loadProject = useProjectStore((s) => s.loadProject)

  const projectMode = useProjectStore((s) => s.mode)
  const projectVoice = useProjectStore((s) => s.voice)
  const projectVoiceDesignPrompt = useProjectStore((s) => s.voiceDesignPrompt)
  const projectVoiceClonePath = useProjectStore((s) => s.voiceClonePath)
  const setProjectMode = useProjectStore((s) => s.setMode)
  const setProjectVoice = useProjectStore((s) => s.setVoice)
  const setProjectVoiceDesignPrompt = useProjectStore((s) => s.setVoiceDesignPrompt)
  const setProjectVoiceClonePath = useProjectStore((s) => s.setVoiceClonePath)

  const project = useSettingsStore((s) => s.project)
  const setProject = useSettingsStore((s) => s.setProject)

  const [playingId, setPlayingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectConfigOpen, setProjectConfigOpen] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [projects, setProjects] = useState<string[]>([])

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

  // 启动时加载上次选中的项目的句子
  useEffect(() => {
    const savedProject = useSettingsStore.getState().project
    loadProject(savedProject)
  }, [loadProject])

  // 获取项目列表
  const fetchProjects = useCallback(async () => {
    try {
      const projectList = await listProjects()
      setProjects(projectList)
    } catch (error) {
      console.error("Failed to fetch projects:", error)
    }
  }, [])

  // 打开项目配置卡片
  const handleOpenProjectConfig = useCallback(() => {
    void fetchProjects()
    setProjectConfigOpen(true)
  }, [fetchProjects])

  // 关闭项目配置卡片
  const handleCloseProjectConfig = useCallback(() => {
    setProjectConfigOpen(false)
  }, [])

  // 选择项目：保存当前 → 加载目标 → 更新 settings
  const handleSelectProject = useCallback(
    (selectedProject: string | null) => {
      loadProject(selectedProject)
      setProject(selectedProject)
    },
    [loadProject, setProject],
  )

  // 创建项目
  const handleCreateProject = useCallback(
    async (name: string) => {
      try {
        const updatedProjects = await createProject(name)
        setProjects(updatedProjects)
        loadProject(name)
        setProject(name)
      } catch (error) {
        console.error("Failed to create project:", error)
      }
    },
    [loadProject, setProject],
  )

  // 由句子状态派生的高层阶段
  const phase: Phase =
    sentences.length === 0
      ? "empty"
      : sentences.some((s) => s.status === "generating" || s.status === "queued")
        ? "generating"
        : sentences.every((s) => s.status === "completed" || s.status === "failed")
          ? "complete"
          : "imported"

  const failedCount = sentences.filter((s) => s.status === "failed").length

  // --- 真实 TTS 生成（支持并行） ---
  const runGeneration = useCallback(
    async (ids: string[]) => {
      const runId = ++genRunId.current
      const settings = useSettingsStore.getState()
      const projState = useProjectStore.getState()
      const params = {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        mode: projState.mode,
        voice: projState.voice,
        voiceDesignPrompt: projState.voiceDesignPrompt,
        voiceClonePath: projState.voiceClonePath,
      }
      const concurrency = settings.concurrency
      const currentProject = settings.project

      // 先把所有句子标记为 queued（等待中）
      for (const id of ids) {
        updateSentence(id, { status: "queued" })
      }

      // 并行 worker 池
      const queue = [...ids]
      const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
        while (queue.length > 0) {
          if (genRunId.current !== runId) return
          const id = queue.shift()!
          const sentence = useProjectStore.getState().sentences.find((s) => s.id === id)
          if (!sentence) continue
          updateSentence(id, { status: "generating" })
          try {
            const result = await generateSentenceAudio(id, sentence.text, params, currentProject)
            if (genRunId.current !== runId) return
            const newVersion = { audioPath: result.audioPath, createdAt: Date.now() }
            const currentHistory =
              useProjectStore.getState().sentences.find((s) => s.id === id)?.audioHistory ?? []
            updateSentence(id, {
              status: "completed",
              audioPath: result.audioPath,
              audioHistory: [...currentHistory, newVersion],
            })
          } catch (e) {
            console.error("TTS generate failed:", id, e)
            if (genRunId.current !== runId) return
            updateSentence(id, { status: "failed" })
          }
        }
      })

      await Promise.all(workers)
    },
    [updateSentence],
  )

  // --- Script Editor ---
  const handleOpenScriptEditor = useCallback(() => {
    setScriptEditorOpen(true)
  }, [])

  const handleSaveScript = useCallback(
    (text: string, splitMode: "auto" | "manual") => {
      setScriptEditorOpen(false)
      setPlayingId(null)
      setEditingId(null)

      if (splitMode === "auto") {
        const newSentences = splitTextToSentences(text)
        setSentences(newSentences)
        void runGeneration(newSentences.map((s) => s.id))
      } else {
        const lines = text.split("\n").filter((l) => l.trim().length > 0)
        if (sentences.length === 0) {
          // 无内容 → 新建全部句子
          const newSentences = lines.map((t, i) => ({
            id: generateSentenceId(i, t.trim()),
            text: t.trim(),
            status: "pending" as SentenceStatus,
            audioPath: null,
            audioHistory: [],
            duration: null,
          }))
          setSentences(newSentences)
          void runGeneration(newSentences.map((s) => s.id))
        } else {
          // 有内容 → 按位置对比，变化的重新生成
          const newSentences = lines.map((t, i) => {
            const old = sentences[i]
            const trimmed = t.trim()
            if (old && old.text === trimmed) return old
            return {
              id: old?.id ?? generateSentenceId(i, trimmed),
              text: trimmed,
              status: "pending" as SentenceStatus,
              audioPath: null,
              audioHistory: [],
              duration: null,
            }
          })
          setSentences(newSentences)
          const pendingIds = newSentences.filter((s) => s.status === "pending").map((s) => s.id)
          if (pendingIds.length > 0) void runGeneration(pendingIds)
        }
      }
    },
    [sentences, setSentences, runGeneration],
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

  const handleSwitchVersion = useCallback(
    (id: string, historyIndex: number) => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingId(null)
      switchAudioVersion(id, historyIndex)
    },
    [switchAudioVersion],
  )

  // --- 编辑 ---
  const handleEditCard = useCallback((id: string) => {
    setEditingId(id)
  }, [])

  const handleCommitEdit = useCallback(
    (id: string, text: string) => {
      updateSentence(id, {
        text,
        status: "pending",
        audioPath: null,
        audioHistory: [],
        duration: null,
      })
      setEditingId(null)
      // 编辑后自动触发重新生成
      void runGeneration([id])
    },
    [updateSentence, runGeneration],
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

  // --- 工具栏 ---
  const toolbarAction: ToolbarAction =
    phase === "complete"
      ? { kind: "regenerate-all" }
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
      if (status === "queued") return "queued"
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
      const active = sentences.filter((s) => s.status === "generating").length
      return {
        statusText: `Generating ${done} / ${count} (${active} active)...`,
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

      {settingsOpen ? (
        <SettingsPage />
      ) : (
        <>
          <Toolbar
            action={toolbarAction}
            hasContent={sentences.length > 0}
            onOpenScriptEditor={handleOpenScriptEditor}
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
                    sentence.status === "failed"
                      ? "Generation failed — check API settings"
                      : undefined
                  }
                  onPlay={() => void handlePlay(sentence.id)}
                  onPause={handlePause}
                  onRegenerate={() => handleRegenerateCard(sentence.id)}
                  onRetry={() => handleRegenerateCard(sentence.id)}
                  onEdit={() => handleEditCard(sentence.id)}
                  onCommitEdit={(text) => handleCommitEdit(sentence.id, text)}
                  onCancelEdit={handleCancelEdit}
                  onSwitchVersion={(historyIndex) => handleSwitchVersion(sentence.id, historyIndex)}
                />
              ))}
            </div>
          )}

          <StatusBar
            count={sentences.length}
            {...statusBar}
            project={project}
            onProjectClick={handleOpenProjectConfig}
          />
        </>
      )}

      {scriptEditorOpen && (
        <ScriptEditor
          mode={sentences.length > 0 ? "edit" : "import"}
          initialText={sentences.length > 0 ? sentences.map((s) => s.text).join("\n") : ""}
          ttsMode={projectMode}
          voice={projectVoice}
          voiceDesignPrompt={projectVoiceDesignPrompt}
          voiceClonePath={projectVoiceClonePath}
          onSave={handleSaveScript}
          onClose={() => setScriptEditorOpen(false)}
          onModeChange={setProjectMode}
          onVoiceChange={setProjectVoice}
          onVoiceDesignPromptChange={setProjectVoiceDesignPrompt}
          onVoiceClonePathChange={setProjectVoiceClonePath}
        />
      )}

      {projectConfigOpen && (
        <ProjectConfigCard
          currentProject={project}
          projects={projects}
          onSelect={handleSelectProject}
          onCreate={handleCreateProject}
          onClose={handleCloseProjectConfig}
        />
      )}
    </WindowShell>
  )
}

export default App
