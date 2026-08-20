import type { ProviderId, TtsMode } from "./tts"

export interface ApiVoice {
  id: string
  name: string
}

export interface CapabilityMapping {
  enabled: boolean
  modelId: string
}

export type CapabilityMappings = Record<TtsMode, CapabilityMapping>

export interface ApiConfig {
  id: string
  name: string
  provider: ProviderId
  baseUrl: string
  createdAt: number
  capabilities: CapabilityMappings
  voices: ApiVoice[]
}
