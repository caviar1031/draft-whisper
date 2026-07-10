import type { AudioVersion } from "../types/sentence"

export const MAX_AUDIO_VERSIONS = 5

export function retainRecentAudioVersions(versions: AudioVersion[]): {
  retained: AudioVersion[]
  evictedPaths: string[]
} {
  const splitIndex = Math.max(0, versions.length - MAX_AUDIO_VERSIONS)
  return {
    retained: versions.slice(splitIndex),
    evictedPaths: versions.slice(0, splitIndex).map((version) => version.audioPath),
  }
}
