import type { Sentence } from "./sentence"

export type TtsMode = "basic" | "voice-design" | "voice-clone"

export interface Project {
  apiConfigId: string | null
  mode: TtsMode
  voice: string
  voiceDesignId: string | null
  voiceDesignPrompt: string
  voiceCloneSampleId: string | null
  voiceClonePath: string | null
  performancePrompt: string
  sentences: Sentence[]
}
