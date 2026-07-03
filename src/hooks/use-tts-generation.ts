import { generateSentenceAudio, readAudioAsUrl } from "@/services/tts"
import { useProjectStore } from "@/stores/project-store"
import { useSettingsStore } from "@/stores/settings-store"
import type { SentenceStatus } from "@/types"
import { useCallback, useRef } from "react"

export function useTtsGeneration() {
  const updateSentence = useProjectStore((s) => s.updateSentence)
  const genRunId = useRef(0)

  const runGeneration = useCallback(
    async (ids: string[]) => {
      const runId = ++genRunId.current
      const settings = useSettingsStore.getState()
      const projState = useProjectStore.getState()
      const params = {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: projState.model,
        mode: projState.mode,
        voice: projState.voice,
        voiceDesignPrompt: projState.voiceDesignPrompt,
        voiceClonePath: projState.voiceClonePath,
      }
      const concurrency = settings.concurrency
      const currentProject = settings.project

      // 先把所有句子标记为 queued（等待中）
      for (const id of ids) {
        updateSentence(id, { status: "queued" as SentenceStatus })
      }

      // 并行 worker 池
      const queue = [...ids]
      const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
        while (queue.length > 0) {
          if (genRunId.current !== runId) return
          const id = queue.shift()!
          const sentence = useProjectStore.getState().sentences.find((s) => s.id === id)
          if (!sentence) continue
          updateSentence(id, { status: "generating" as SentenceStatus })
          try {
            const result = await generateSentenceAudio(id, sentence.text, params, currentProject)
            if (genRunId.current !== runId) return
            const newVersion = { audioPath: result.audioPath, createdAt: Date.now() }
            const currentHistory =
              useProjectStore.getState().sentences.find((s) => s.id === id)?.audioHistory ?? []
            updateSentence(id, {
              status: "completed" as SentenceStatus,
              audioPath: result.audioPath,
              audioHistory: [...currentHistory, newVersion],
            })
            // 预缓存 Blob URL，确保点击播放时 readAudioAsUrl 能从缓存瞬间返回，
            // 避免 async IPC 打断用户手势链导致 WKWebView autoplay 策略阻止播放。
            readAudioAsUrl(result.audioPath).catch(() => {})
          } catch (e) {
            console.error("TTS generate failed:", id, e)
            if (genRunId.current !== runId) return
            updateSentence(id, { status: "failed" as SentenceStatus })
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

  return { runGeneration, generateAll, retryFailed }
}
