const isMacOS = /Macintosh|Mac OS/i.test(navigator.userAgent) || navigator.platform.includes("Mac")

export const keyboardShortcutLabels = {
  toggleAlwaysOnTop: isMacOS ? "⌘⇧T" : "Ctrl+Shift+T",
  openSettings: isMacOS ? "⌘," : "Ctrl+,",
  openScriptEditor: isMacOS ? "⌘O" : "Ctrl+O",
  navigateSentences: "↑ / ↓",
  playPauseSentence: "Space",
  editSentence: "E",
}

export const isMacOSPlatform = isMacOS

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']") !== null
  )
}
