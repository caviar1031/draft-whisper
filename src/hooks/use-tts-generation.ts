import { cleanupAudioFiles, readAudioAsUrl } from "@/services/audio"
import { generateSentenceAudio } from "@/services/tts"
import { useProjectStore } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useVoiceDesignStore } from "@/stores/voice-design-store"
import { useVoiceSampleStore } from "@/stores/voice-sample-store"
import type { SentenceStatus } from "@/types/sentence"
import type { TtsParams } from "@/types/tts"
import { retainRecentAudioVersions } from "@/utils/audio-history"
import { GenerationTaskRegistry } from "@/utils/generation-tasks"
import { resolveCapability } from "@/utils/provider-catalog"
import { getTtsConfigurationError, resolvePerformancePrompt } from "@/utils/tts-config"
import { resolveProjectVoiceResources } from "@/utils/voice-resources"
import { useCallback, useRef } from "react"

export function useTtsGeneration() {
  const updateSentence = useProjectStore((s) => s.updateSentence)
  const tasks = useRef(new GenerationTaskRegistry())

  /**
   * 取消指定句子（或全部句子）的前端任务接管。
   * 已经发出的 HTTP 请求无法中止，但返回结果会被丢弃，并把瞬态状态恢复为稳定状态。
   */
  const cancelGeneration = useCallback(
    (ids?: string[]) => {
      const targetIds = tasks.current.cancel(ids)
      for (const id of targetIds) {
        const sentence = useProjectStore.getState().sentences.find((s) => s.id === id)
        if (sentence?.status === "queued" || sentence?.status === "generating") {
          updateSentence(id, {
            status: sentence.audioPath ? "completed" : "pending",
          })
        }
      }
    },
    [updateSentence],
  )

  const runGeneration = useCallback(
    async (ids: string[]) => {
      const settings = useSettingsStore.getState()
      const projState = useProjectStore.getState()
      const apiConfig = settings.apiConfigs.find((config) => config.id === projState.apiConfigId)
      const capability = apiConfig ? resolveCapability(apiConfig, projState.mode) : null
      const voiceResources = resolveProjectVoiceResources(
        {
          voiceDesignId: projState.voiceConfigs["voice-design"].presetId,
          voiceDesignPrompt: projState.voiceConfigs["voice-design"].prompt,
          voiceCloneSampleId: projState.voiceConfigs["voice-clone"].sampleId,
          voiceClonePath: projState.voiceConfigs["voice-clone"].samplePath,
        },
        useVoiceDesignStore.getState().designs,
        useVoiceSampleStore.getState().samples,
      )
      const performancePrompt =
        projState.mode === "basic"
          ? projState.voiceConfigs.basic.performancePrompt
          : projState.mode === "voice-clone"
            ? projState.voiceConfigs["voice-clone"].performancePrompt
            : ""
      const resolvedProject = {
        apiConfigId: projState.apiConfigId,
        mode: projState.mode,
        voice: projState.voiceConfigs.basic.voice,
        voiceDesignPrompt: voiceResources.voiceDesignPrompt,
        voiceClonePath: voiceResources.voiceClonePath,
      }
      const configurationError = getTtsConfigurationError(
        resolvedProject,
        settings.apiConfigs,
        settings.apiKeys,
      )
      if (configurationError || !apiConfig || !capability) return
      const params: TtsParams = {
        provider: apiConfig.provider,
        baseUrl: apiConfig.baseUrl,
        apiKey: settings.apiKeys[apiConfig.id] ?? "",
        model: capability.modelId,
        mode: projState.mode,
        voice: projState.mode === "basic" ? projState.voiceConfigs.basic.voice : "",
        voiceDesignPrompt: resolvedProject.voiceDesignPrompt,
        voiceClonePath: resolvedProject.voiceClonePath,
        performancePrompt,
      }
      const concurrency = settings.concurrency
      const currentProject = projState.currentProject

      // 每个句子独立拥有最新任务令牌：新任务只替换相同句子，不会误取消其他生成。
      const queuedTasks = tasks.current.start(ids, currentProject)
      const taskById = new Map(queuedTasks.map((task) => [task.id, task]))

      // 先把所有句子标记为 queued（等待中）
      for (const id of ids) {
        updateSentence(id, {
          status: "queued" as SentenceStatus,
          errorMessage: undefined,
        })
      }

      // 并行 worker 池
      const queue = [...ids]
      const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
        while (queue.length > 0) {
          const id = queue.shift()!
          const task = taskById.get(id)
          if (!task || !tasks.current.isCurrent(task, useProjectStore.getState().currentProject)) {
            continue
          }
          const sentence = useProjectStore.getState().sentences.find((s) => s.id === id)
          if (!sentence) continue
          updateSentence(id, { status: "generating" as SentenceStatus })
          try {
            const sentenceParams = {
              ...params,
              performancePrompt: resolvePerformancePrompt(
                apiConfig.provider,
                projState.mode,
                sentence.styleInstruction ?? "",
                params.performancePrompt,
              ),
            }
            const result = await generateSentenceAudio(
              id,
              sentence.text,
              sentenceParams,
              currentProject,
            )
            let preloadError: unknown = null
            try {
              // Finish preparing the Blob URL before exposing the sentence as
              // ready. This removes the first-click race between the ready UI
              // and the asynchronous tts_read_audio IPC call.
              await readAudioAsUrl(result.audioPath)
            } catch (error) {
              preloadError = error
            }
            if (!tasks.current.isCurrent(task, useProjectStore.getState().currentProject)) {
              cleanupAudioFiles([result.audioPath])
              continue
            }
            const newVersion = { audioPath: result.audioPath, createdAt: Date.now() }
            const currentHistory =
              useProjectStore.getState().sentences.find((s) => s.id === id)?.audioHistory ?? []
            const nextHistory = [...currentHistory, newVersion]
            const { retained, evictedPaths } = retainRecentAudioVersions(nextHistory)
            updateSentence(id, {
              status: "completed" as SentenceStatus,
              errorMessage: undefined,
              audioPath: result.audioPath,
              audioHistory: retained,
            })
            if (evictedPaths.length > 0) cleanupAudioFiles(evictedPaths)
            if (preloadError) console.error("Audio preload after generation failed:", preloadError)
          } catch (e) {
            console.error("TTS generate failed:", id, e)
            if (!tasks.current.isCurrent(task, useProjectStore.getState().currentProject)) continue
            updateSentence(id, {
              status: "failed" as SentenceStatus,
              errorMessage: e instanceof Error ? e.message : String(e),
            })
          } finally {
            tasks.current.finish(task)
          }
        }
      })

      await Promise.all(workers)
    },
    [updateSentence],
  )

  const generateAll = useCallback(
    (ids: string[]) => {
      void runGeneration(ids)
    },
    [runGeneration],
  )

  const retryFailed = useCallback(
    (ids: string[]) => {
      void runGeneration(ids)
    },
    [runGeneration],
  )

  return { runGeneration, generateAll, retryFailed, cancelGeneration }
}
