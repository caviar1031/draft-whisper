import type { Sentence } from "./sentence"

export type TtsMode = "basic" | "voice-design" | "voice-clone"

export interface Project {
  mode: TtsMode
  voice: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
  sentences: Sentence[]
}
