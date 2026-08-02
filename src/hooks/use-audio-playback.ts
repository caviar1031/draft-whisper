import { getCachedAudioUrl, readAudioAsUrl } from "@/services/tts"
import { useProjectStore } from "@/stores/project-store"
import { useCallback, useEffect, useRef, useState } from "react"

export function useAudioPlayback() {
  const updateSentence = useProjectStore((s) => s.updateSentence)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const disposedRef = useRef(false)
  const requestIdRef = useRef(0)

  // unmount 时清理
  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      requestIdRef.current += 1
      if (audioRef.current) {
        audioRef.current.onended = null
        audioRef.current.onerror = null
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handlePlay = useCallback(
    (id: string) => {
      const sentence = useProjectStore.getState().sentences.find((s) => s.id === id)
      if (!sentence?.audioPath) return
      setPlaybackError(null)

      const requestId = ++requestIdRef.current
      if (audioRef.current) {
        audioRef.current.onended = null
        audioRef.current.onerror = null
        audioRef.current.pause()
        audioRef.current = null
      }

      const startPlayback = (url: string) => {
        if (disposedRef.current || requestIdRef.current !== requestId) return

        const audio = new Audio()
        audio.preload = "auto"
        audio.src = url
        audioRef.current = audio
        setPlayingId(id)

        const stopPlayback = () => {
          if (audioRef.current !== audio) return
          setPlayingId(null)
          audioRef.current = null
        }

        audio.onloadedmetadata = () => {
          updateSentence(id, { duration: audio.duration })
        }
        audio.onended = stopPlayback
        audio.onerror = (event) => {
          console.error("Audio playback error:", event, audio.error)
          setPlaybackError(audio.error?.message ?? "Audio playback failed")
          stopPlayback()
        }

        // When the Blob URL is cached, this stays in the click handler's
        // synchronous call stack. WKWebView can otherwise reject playback
        // after an asynchronous IPC read as an autoplay violation.
        void audio.play().catch((error: unknown) => {
          if (audioRef.current !== audio) return
          console.error("Audio play() failed:", error)
          setPlaybackError(error instanceof Error ? error.message : String(error))
          stopPlayback()
        })
      }

      const cachedUrl = getCachedAudioUrl(sentence.audioPath)
      if (cachedUrl) {
        startPlayback(cachedUrl)
        return
      }

      // A cold cache still needs an async IPC read. Preloading on generation
      // and project load normally avoids this branch; the request guard keeps
      // a slow read from starting playback after the user chose another item.
      void readAudioAsUrl(sentence.audioPath)
        .then(startPlayback)
        .catch((error: unknown) => {
          if (disposedRef.current || requestIdRef.current !== requestId) return
          console.error("Audio preload failed:", error)
          setPlaybackError(error instanceof Error ? error.message : String(error))
        })
    },
    [updateSentence],
  )

  const handlePause = useCallback(() => {
    requestIdRef.current += 1
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  return { playingId, playbackError, handlePlay, handlePause }
}
