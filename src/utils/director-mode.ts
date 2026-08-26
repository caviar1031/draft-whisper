import type { ProviderId, TtsMode } from "@/types/tts"

export type SentenceEditTarget = "text" | "style"

/**
 * Per-sentence director instructions are currently supported only by MiMo's
 * basic voice mode, and only after a voice has been selected.
 */
export function isDirectorModeAvailable(
  provider: ProviderId | null | undefined,
  mode: TtsMode,
  voice: string,
): boolean {
  return provider === "mimo" && mode === "basic" && voice.trim().length > 0
}

/**
 * Resolve the first field that receives focus when a sentence editor opens.
 * Unsupported or disabled director mode must always fall back to text.
 */
export function resolveSentenceEditTarget(
  directorModeEnabled: boolean,
  directorModeAvailable: boolean,
): SentenceEditTarget {
  return directorModeEnabled && directorModeAvailable ? "style" : "text"
}
