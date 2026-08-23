import type { Sentence } from "./sentence"
import type { AudioFormat, TtsMode } from "./tts"

export type ProjectVoiceConfig =
  | {
      mode: "basic"
      voice: string
      performancePrompt: string
    }
  | {
      mode: "voice-design"
      presetId: string | null
      prompt: string
    }
  | {
      mode: "voice-clone"
      sampleId: string | null
      samplePath: string | null
      performancePrompt: string
    }

export type ProjectVoiceConfigs = {
  [Mode in TtsMode]: Extract<ProjectVoiceConfig, { mode: Mode }>
}

export interface Project {
  apiConfigId: string | null
  mode: TtsMode
  outputFormat: AudioFormat
  voiceConfigs: ProjectVoiceConfigs
  sentences: Sentence[]
}
