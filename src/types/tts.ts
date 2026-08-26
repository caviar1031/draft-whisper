export type TtsMode = "basic" | "voice-design" | "voice-clone"
export type ProviderId = "mimo" | "fish-audio" | "custom"
export type AudioFormat = "mp3" | "wav"

export interface AudioFormatTestResult {
  supported: boolean
  testedAt: number
  modelId: string
  baseUrl: string
  error?: string
}

export type AudioFormatTestResults = Partial<Record<AudioFormat, AudioFormatTestResult>>

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
  audioFormat: AudioFormat
}

export interface TtsResult {
  audioPath: string
}
