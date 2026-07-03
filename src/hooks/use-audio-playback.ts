import { readAudioAsUrl } from "@/services/tts"
import { useProjectStore } from "@/stores/project-store"
import { useCallback, useEffect, useRef, useState } from "react"

export function useAudioPlayback() {
  const updateSentence = useProjectStore((s) => s.updateSentence)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const disposedRef = useRef(false)

  // unmount 时清理
  useEffect(() => {
    return () => {
      disposedRef.current = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

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
        if (disposedRef.current) return
        const audio = new Audio(url)
        audioRef.current = audio
        setPlayingId(id)

        audio.onloadedmetadata = () => {
          updateSentence(id, { duration: audio.duration })
        }
        audio.onended = () => {
          setPlayingId(null)
          audioRef.current = null
        }
        audio.onerror = (e) => {
          console.error("Audio playback error:", e, audio.error)
          setPlayingId(null)
          audioRef.current = null
        }

        await audio.play()
      } catch (e) {
        console.error("handlePlay failed:", e)
        if (!disposedRef.current) setPlayingId(null)
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

  return { playingId, handlePlay, handlePause }
}
