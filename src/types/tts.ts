export type TtsMode = "basic" | "voice-design" | "voice-clone"
export type ProviderId = "mimo" | "fish-audio" | "custom"

export interface TtsParams {
  provider: ProviderId
  baseUrl: string
  apiKey: string
  model: string
  mode: TtsMode
  voice: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
  performancePrompt: string
}

export interface TtsResult {
  audioPath: string
}
