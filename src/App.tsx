import { EmptyState } from "@/components/dw/empty-state"
import { type CardView, SentenceCard } from "@/components/dw/sentence-card"
import { TitleBar } from "@/components/dw/title-bar"
import { Toolbar, type ToolbarAction } from "@/components/dw/toolbar"
import { StatusBar, WindowShell } from "@/components/dw/window-shell"
import { useAudioPlayback } from "@/hooks/use-audio-playback"
import { useTtsGeneration } from "@/hooks/use-tts-generation"
import i18n from "@/i18n"
import { readAudioAsUrl } from "@/services/audio"
import { createProject, deleteProject, listProjects } from "@/services/projects"
import { deleteStoredProject, flushCurrentProject, useProjectStore } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useVoiceDesignStore } from "@/stores/voice-design-store"
import { useVoiceSampleStore } from "@/stores/voice-sample-store"
import type { SentenceStatus } from "@/types/sentence"
import { isDirectorModeAvailable, resolveSentenceEditTarget } from "@/utils/director-mode"
import { generateSentenceId } from "@/utils/id"
import { resolveCapability } from "@/utils/provider-catalog"
import { parseScriptLines } from "@/utils/script-lines"
import { resolveLanguage } from "@/utils/settings-validation"
import { registerTauriListener } from "@/utils/tauri-listener"
import { applyTheme, getThemeMediaQuery } from "@/utils/theme"
import { getTtsConfigurationError } from "@/utils/tts-config"
import { resolveProjectVoiceResources } from "@/utils/voice-resources"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { RefreshCw, TriangleAlert, X } from "lucide-react"
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

const SettingsPage = lazy(() =>
  import("@/components/dw/settings-page").then((module) => ({ default: module.SettingsPage })),
)
const ScriptEditor = lazy(() =>
  import("@/components/dw/script-editor").then((module) => ({ default: module.ScriptEditor })),
)
const ProjectConfigCard = lazy(() =>
  import("@/components/dw/project-config-card").then((module) => ({
    default: module.ProjectConfigCard,
  })),
)

type Phase = "empty" | "imported" | "generating" | "complete"

function App() {
  const { t } = useTranslation()
  const sentences = useProjectStore((s) => s.sentences)
  const setSentences = useProjectStore((s) => s.setSentences)
  const updateSentence = useProjectStore((s) => s.updateSentence)
  const switchAudioVersion = useProjectStore((s) => s.switchAudioVersion)
  const loadProject = useProjectStore((s) => s.loadProject)

  const projectMode = useProjectStore((s) => s.mode)
  const projectOutputFormat = useProjectStore((s) => s.outputFormat)
  const projectApiConfigId = useProjectStore((s) => s.apiConfigId)
  const projectVoice = useProjectStore((s) => s.voiceConfigs.basic.voice)
  const projectVoiceDesignId = useProjectStore((s) => s.voiceConfigs["voice-design"].presetId)
  const projectVoiceDesignPrompt = useProjectStore((s) => s.voiceConfigs["voice-design"].prompt)
  const projectVoiceCloneSampleId = useProjectStore((s) => s.voiceConfigs["voice-clone"].sampleId)
  const projectVoiceClonePath = useProjectStore((s) => s.voiceConfigs["voice-clone"].samplePath)
  const projectPerformancePrompt = useProjectStore((s) =>
    s.mode === "basic"
      ? s.voiceConfigs.basic.performancePrompt
      : s.mode === "voice-clone"
        ? s.voiceConfigs["voice-clone"].performancePrompt
        : "",
  )
  const setProjectMode = useProjectStore((s) => s.setMode)
  const setProjectOutputFormat = useProjectStore((s) => s.setOutputFormat)
  const setProjectApiConfigId = useProjectStore((s) => s.setApiConfigId)
  const setProjectVoice = useProjectStore((s) => s.setVoice)
  const setProjectVoiceDesignId = useProjectStore((s) => s.setVoiceDesignId)
  const setProjectVoiceDesignPrompt = useProjectStore((s) => s.setVoiceDesignPrompt)
  const setProjectVoiceCloneSampleId = useProjectStore((s) => s.setVoiceCloneSampleId)
  const setProjectVoiceClonePath = useProjectStore((s) => s.setVoiceClonePath)
  const setProjectPerformancePrompt = useProjectStore((s) => s.setPerformancePrompt)

  const project = useSettingsStore((s) => s.project)
  const setProject = useSettingsStore((s) => s.setProject)
  const apiConfigs = useSettingsStore((s) => s.apiConfigs)
  const apiKeys = useSettingsStore((s) => s.apiKeys)
  const language = useSettingsStore((s) => s.language)
  const theme = useSettingsStore((s) => s.theme)
  const defaultApiConfigId = useSettingsStore((s) => s.defaultApiConfigId)
  const voiceDesigns = useVoiceDesignStore((s) => s.designs)
  const voiceSamples = useVoiceSampleStore((s) => s.samples)
  const effectiveVoiceResources = resolveProjectVoiceResources(
    {
      voiceDesignId: projectVoiceDesignId,
      voiceDesignPrompt: projectVoiceDesignPrompt,
      voiceCloneSampleId: projectVoiceCloneSampleId,
      voiceClonePath: projectVoiceClonePath,
    },
    voiceDesigns,
    voiceSamples,
  )
  const effectiveVoiceDesignPrompt = effectiveVoiceResources.voiceDesignPrompt
  const effectiveVoiceClonePath = effectiveVoiceResources.voiceClonePath
  const selectedApiConfig = apiConfigs.find((config) => config.id === projectApiConfigId)
  const projectModel = resolveCapability(selectedApiConfig, projectMode)?.modelId ?? ""
  const directorModeAvailable = isDirectorModeAvailable(
    selectedApiConfig?.provider,
    projectMode,
    projectVoice,
  )

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(language))
  }, [language])

  useEffect(() => {
    applyTheme(theme)
    if (theme !== "system") return

    const mediaQuery = getThemeMediaQuery()
    if (!mediaQuery) return

    const handleSystemThemeChange = () => applyTheme("system")
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleSystemThemeChange)
      return () => mediaQuery.removeEventListener("change", handleSystemThemeChange)
    }

    mediaQuery.addListener(handleSystemThemeChange)
    return () => mediaQuery.removeListener(handleSystemThemeChange)
  }, [theme])

  useEffect(() => {
    if (!projectApiConfigId && defaultApiConfigId) setProjectApiConfigId(defaultApiConfigId)
  }, [defaultApiConfigId, projectApiConfigId, setProjectApiConfigId])

  const { playingId, playbackError, handlePlay, handlePause, clearPlaybackError } =
    useAudioPlayback()
  const { runGeneration, generateAll, retryFailed, cancelGeneration } = useTtsGeneration()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectConfigOpen, setProjectConfigOpen] = useState(false)
  const [directorMode, setDirectorMode] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [projects, setProjects] = useState<string[]>([])
  const [projectError, setProjectError] = useState<string | null>(null)
  const closingRef = useRef(false)

  const effectiveDirectorMode = directorMode && directorModeAvailable

  useEffect(() => {
    if (!directorModeAvailable) setDirectorMode(false)
  }, [directorModeAvailable])

  // 启动时加载上次选中的项目的句子
  useEffect(() => {
    const savedProject = useSettingsStore.getState().project
    loadProject(savedProject)
  }, [loadProject])

  // 窗口关闭前立即保存项目数据（绕过 debounce）
  useEffect(() => {
    const win = getCurrentWindow()
    return registerTauriListener(() =>
      win.onCloseRequested(async (event) => {
        event.preventDefault()
        if (closingRef.current) return
        closingRef.current = true
        try {
          flushCurrentProject()
        } finally {
          try {
            await win.hide()
          } finally {
            closingRef.current = false
          }
        }
      }),
    )
  }, [])

  // 预缓存已有音频的 Blob URL（启动/切换项目时），确保点击播放时瞬间返回，
  // 避免 async IPC 打断用户手势链导致 WKWebView autoplay 策略阻止播放。
  const preloadedPathsRef = useRef(new Set<string>())
  const preloadedProjectRef = useRef<string | null>(project)
  useEffect(() => {
    if (preloadedProjectRef.current !== project) {
      preloadedPathsRef.current.clear()
      preloadedProjectRef.current = project
    }
    for (const s of sentences) {
      if (s.audioPath && !preloadedPathsRef.current.has(s.audioPath)) {
        preloadedPathsRef.current.add(s.audioPath)
        readAudioAsUrl(s.audioPath).catch(() => {})
      }
    }
  }, [project, sentences])

  // 获取项目列表
  const fetchProjects = useCallback(async () => {
    try {
      const projectList = await listProjects()
      setProjects(projectList)
      setProjectError(null)
    } catch (error) {
      console.error("Failed to fetch projects:", error)
      setProjectError(error instanceof Error ? error.message : String(error))
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
      cancelGeneration()
      handlePause()
      loadProject(selectedProject)
      setProject(selectedProject)
    },
    [cancelGeneration, handlePause, loadProject, setProject],
  )

  // 创建项目
  const handleCreateProject = useCallback(
    async (name: string) => {
      try {
        const updatedProjects = await createProject(name)
        setProjects(updatedProjects)
        cancelGeneration()
        handlePause()
        loadProject(name)
        setProject(name)
        setProjectError(null)
      } catch (error) {
        console.error("Failed to create project:", error)
        setProjectError(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    [cancelGeneration, handlePause, loadProject, setProject],
  )

  const handleDeleteProject = useCallback(
    async (name: string) => {
      try {
        if (project === name) {
          cancelGeneration()
          handlePause()
        }
        const updatedProjects = await deleteProject(name)
        setProjects(updatedProjects)
        if (project === name) {
          loadProject(null)
          setProject(null)
        }
        deleteStoredProject(name)
        setProjectError(null)
      } catch (error) {
        console.error("Failed to delete project:", error)
        setProjectError(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    [cancelGeneration, handlePause, loadProject, project, setProject],
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
  const ttsConfigurationError = getTtsConfigurationError(
    {
      apiConfigId: projectApiConfigId,
      mode: projectMode,
      outputFormat: projectOutputFormat,
      voice: projectVoice,
      voiceDesignPrompt: effectiveVoiceDesignPrompt,
      voiceClonePath: effectiveVoiceClonePath,
    },
    apiConfigs,
    apiKeys,
  )
  const localizedTtsConfigurationError = ttsConfigurationError ? t(ttsConfigurationError) : null

  // --- Script Editor ---
  const handleOpenScriptEditor = useCallback(() => {
    setScriptEditorOpen(true)
  }, [])

  const handleSaveScript = useCallback(
    (text: string) => {
      setScriptEditorOpen(false)
      cancelGeneration()
      handlePause()
      setEditingId(null)

      const lines = parseScriptLines(text)
      if (sentences.length === 0) {
        // No existing content: create all sentences from non-empty lines.
        const newSentences = lines.map((t, i) => ({
          id: generateSentenceId(i, t),
          text: t,
          styleInstruction: "",
          status: "pending" as SentenceStatus,
          audioPath: null,
          audioHistory: [],
          duration: null,
        }))
        setSentences(newSentences)
        void runGeneration(newSentences.map((s) => s.id))
      } else {
        // Existing content: compare lines by position and regenerate changed sentences.
        const newSentences = lines.map((t, i) => {
          const old = sentences[i]
          if (old && old.text === t) return old
          if (old) {
            return {
              ...old,
              text: t,
              status: "pending" as SentenceStatus,
              errorMessage: undefined,
              duration: null,
            }
          }
          return {
            id: generateSentenceId(i, t),
            text: t,
            styleInstruction: "",
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
    },
    [cancelGeneration, sentences, setSentences, runGeneration, handlePause],
  )

  const handleGenerateAll = useCallback(() => {
    generateAll(sentences.map((s) => s.id))
  }, [sentences, generateAll])

  const handleRegenerateAll = useCallback(() => {
    generateAll(sentences.map((s) => s.id))
  }, [sentences, generateAll])

  const handleRetryAll = useCallback(() => {
    retryFailed(sentences.filter((s) => s.status === "failed").map((s) => s.id))
  }, [sentences, retryFailed])

  const handleRegenerateCard = useCallback(
    (id: string) => {
      void runGeneration([id])
    },
    [runGeneration],
  )

  // --- 音频版本切换 ---
  const handleSwitchVersion = useCallback(
    (id: string, historyIndex: number) => {
      handlePause()
      switchAudioVersion(id, historyIndex)
    },
    [handlePause, switchAudioVersion],
  )

  // --- 编辑 ---
  const handleEditCard = useCallback((id: string) => {
    setEditingId(id)
  }, [])

  const handleToggleDirectorMode = useCallback(() => {
    if (!directorModeAvailable || editingId !== null) return
    setDirectorMode((current) => !current)
  }, [directorModeAvailable, editingId])

  const handleCommitEdit = useCallback(
    (id: string, text: string, styleInstruction: string) => {
      updateSentence(id, {
        text,
        styleInstruction,
        status: "pending",
        errorMessage: undefined,
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
      ? {
          kind: "regenerate-all",
          disabled: Boolean(localizedTtsConfigurationError),
          disabledReason: localizedTtsConfigurationError ?? undefined,
        }
      : {
          kind: "generate",
          disabled:
            phase === "empty" || phase === "generating" || Boolean(localizedTtsConfigurationError),
          disabledReason: localizedTtsConfigurationError ?? undefined,
        }

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
    if (phase === "empty") return { statusText: t("app.ready"), statusTone: "default" as const }
    if (phase === "imported") return { statusText: t("app.ready"), statusTone: "default" as const }
    if (phase === "generating") {
      const done = sentences.filter((s) => s.status === "completed" || s.status === "failed").length
      const active = sentences.filter((s) => s.status === "generating").length
      return {
        statusText: t("app.generating", { done, total: count, active }),
        statusTone: "generating" as const,
      }
    }
    if (editingId !== null)
      return { statusText: t("app.pendingEdit"), statusTone: "pending" as const }
    if (failedCount > 0)
      return {
        statusText: t("app.failedStatus", { count: failedCount, completed: count - failedCount }),
        statusTone: "error" as const,
      }
    return { statusText: t("app.allReady"), statusTone: "ready" as const }
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
        <Suspense fallback={<div className="dw-page-loading">{t("app.loadingSettings")}</div>}>
          <SettingsPage />
        </Suspense>
      ) : (
        <>
          <Toolbar
            action={toolbarAction}
            hasContent={sentences.length > 0}
            onOpenScriptEditor={handleOpenScriptEditor}
            directorModeEnabled={effectiveDirectorMode}
            directorModeDisabled={!directorModeAvailable || editingId !== null}
            directorModeDisabledReason={
              editingId !== null ? t("app.directorModeEditing") : t("app.directorModeUnavailable")
            }
            onToggleDirectorMode={handleToggleDirectorMode}
            onAction={handleToolbarAction}
          />

          {playbackError && (
            <div className="dw-retry-all-bar" role="alert">
              <span className="dw-retry-all-label">
                <TriangleAlert size={14} strokeWidth={2} style={{ color: "var(--state-error)" }} />
                <span className="dw-retry-all-message">Playback failed: {playbackError}</span>
              </span>
              <button
                type="button"
                className="dw-retry-all-close"
                onClick={clearPlaybackError}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          )}

          {localizedTtsConfigurationError && sentences.length > 0 && (
            <div className="dw-retry-all-bar" role="alert">
              <span className="dw-retry-all-label">
                <TriangleAlert size={14} strokeWidth={2} style={{ color: "var(--state-error)" }} />
                <span className="dw-retry-all-message">{localizedTtsConfigurationError}</span>
              </span>
              <button type="button" className="dw-retry-all-btn" onClick={handleOpenScriptEditor}>
                {t("app.configureVoice")}
              </button>
            </div>
          )}

          {failedCount > 0 && (
            <div className="dw-retry-all-bar">
              <span className="dw-retry-all-label">
                <TriangleAlert size={14} strokeWidth={2} style={{ color: "var(--state-error)" }} />
                <span className="dw-retry-all-message">
                  {t("app.failedCount", { count: failedCount })}
                </span>
              </span>
              <button type="button" className="dw-retry-all-btn" onClick={handleRetryAll}>
                <RefreshCw size={14} strokeWidth={2} />
                {t("app.retryAll")}
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
                  queuedLabel={phase === "imported" ? t("app.idle") : t("app.queued")}
                  errorMessage={
                    sentence.status === "failed"
                      ? (sentence.errorMessage ?? t("app.generationFailed"))
                      : undefined
                  }
                  onPlay={() => void handlePlay(sentence.id)}
                  onPause={handlePause}
                  onRegenerate={() => handleRegenerateCard(sentence.id)}
                  onRetry={() => handleRegenerateCard(sentence.id)}
                  onEdit={() => handleEditCard(sentence.id)}
                  onCommitEdit={(text, styleInstruction) =>
                    handleCommitEdit(sentence.id, text, styleInstruction)
                  }
                  onCancelEdit={handleCancelEdit}
                  onSwitchVersion={(historyIndex) => handleSwitchVersion(sentence.id, historyIndex)}
                  directorInstructionAvailable={directorModeAvailable}
                  initialEditTarget={resolveSentenceEditTarget(
                    effectiveDirectorMode,
                    directorModeAvailable,
                  )}
                  generationDisabled={Boolean(localizedTtsConfigurationError)}
                  generationDisabledReason={localizedTtsConfigurationError ?? undefined}
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
        <Suspense fallback={null}>
          <ScriptEditor
            mode={sentences.length > 0 ? "edit" : "import"}
            initialText={sentences.length > 0 ? sentences.map((s) => s.text).join("\n") : ""}
            ttsMode={projectMode}
            outputFormat={projectOutputFormat}
            apiConfigId={projectApiConfigId}
            apiConfigs={apiConfigs}
            model={projectModel}
            voice={projectVoice}
            voiceDesignId={projectVoiceDesignId}
            voiceDesigns={voiceDesigns}
            voiceDesignPrompt={effectiveVoiceDesignPrompt}
            voiceCloneSampleId={projectVoiceCloneSampleId}
            voiceSamples={voiceSamples}
            voiceClonePath={effectiveVoiceClonePath}
            performancePrompt={projectPerformancePrompt}
            onSave={handleSaveScript}
            onClose={() => setScriptEditorOpen(false)}
            onModeChange={setProjectMode}
            onOutputFormatChange={setProjectOutputFormat}
            onApiConfigChange={setProjectApiConfigId}
            onVoiceChange={setProjectVoice}
            onVoiceDesignIdChange={(id) => {
              setProjectVoiceDesignId(id)
              setProjectVoiceDesignPrompt(voiceDesigns.find((item) => item.id === id)?.prompt ?? "")
            }}
            onVoiceDesignPromptChange={setProjectVoiceDesignPrompt}
            onVoiceCloneSampleIdChange={(id) => {
              setProjectVoiceCloneSampleId(id)
              setProjectVoiceClonePath(
                voiceSamples.find((item) => item.id === id)?.filePath ?? null,
              )
            }}
            onPerformancePromptChange={setProjectPerformancePrompt}
          />
        </Suspense>
      )}

      {projectConfigOpen && (
        <Suspense fallback={null}>
          <ProjectConfigCard
            currentProject={project}
            projects={projects}
            onSelect={handleSelectProject}
            onCreate={handleCreateProject}
            onDelete={handleDeleteProject}
            onClose={handleCloseProjectConfig}
            errorMessage={projectError}
          />
        </Suspense>
      )}
    </WindowShell>
  )
}

export default App
