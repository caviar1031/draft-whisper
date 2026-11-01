import { useEffect } from "react"
import { isEditableTarget, isMacOSPlatform } from "@/utils/keyboard-shortcuts"

interface UseAppKeyboardShortcutsOptions {
  settingsOpen: boolean
  modalOpen: boolean
  playingId: string | null
  onToggleSettings: () => void
  onOpenScriptEditor: () => void
  onToggleAlwaysOnTop: () => void
  onPlay: (sentenceId: string) => void
  onPause: () => void
  onEdit: (sentenceId: string) => void
}

export function useAppKeyboardShortcuts({
  settingsOpen,
  modalOpen,
  playingId,
  onToggleSettings,
  onOpenScriptEditor,
  onToggleAlwaysOnTop,
  onPlay,
  onPause,
  onEdit,
}: UseAppKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return

      const hasPrimaryModifier = isMacOSPlatform
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey
      const hasModifier = event.metaKey || event.ctrlKey || event.altKey
      const key = event.key.toLowerCase()

      if (hasPrimaryModifier && !event.altKey) {
        if (isEditableTarget(event.target)) {
          if (key === "," || key === "o" || (key === "t" && event.shiftKey)) {
            event.preventDefault()
          }
          return
        }

        if (key === "," && !event.shiftKey) {
          event.preventDefault()
          if (!modalOpen) onToggleSettings()
          return
        }

        if (key === "o" && !event.shiftKey) {
          event.preventDefault()
          if (!modalOpen && !settingsOpen) onOpenScriptEditor()
          return
        }

        if (key === "t" && event.shiftKey) {
          event.preventDefault()
          onToggleAlwaysOnTop()
          return
        }
      }

      if (hasModifier || modalOpen || settingsOpen || isEditableTarget(event.target)) return

      const focusedCard = document.activeElement
      if (
        !(focusedCard instanceof HTMLElement) ||
        !focusedCard.matches(".sentence-list .dw-sentence-card[data-sentence-id]")
      ) {
        return
      }

      const sentenceId = focusedCard.dataset.sentenceId
      if (!sentenceId) return

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault()
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".sentence-list .dw-sentence-card[data-sentence-id]",
          ),
        )
        const currentIndex = cards.indexOf(focusedCard)
        const nextCard = cards[currentIndex + (event.key === "ArrowUp" ? -1 : 1)]
        nextCard?.focus()
        return
      }

      if (event.key === " ") {
        event.preventDefault()
        if (focusedCard.dataset.sentencePlayable === "true") {
          if (playingId === sentenceId) onPause()
          else onPlay(sentenceId)
        }
        return
      }

      if (key === "e" && focusedCard.dataset.sentenceEditable === "true") {
        event.preventDefault()
        onEdit(sentenceId)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    modalOpen,
    onEdit,
    onOpenScriptEditor,
    onPause,
    onPlay,
    onToggleAlwaysOnTop,
    onToggleSettings,
    playingId,
    settingsOpen,
  ])
}
