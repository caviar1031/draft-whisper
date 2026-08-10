import type { TtsMode } from "./project"

export type ProviderId = "mimo" | "fish-audio"
export type LanguagePreference = "system" | "zh-CN" | "en"

export interface ApiVoice {
  id: string
  name: string
}

export interface CapabilityMapping {
  enabled: boolean
  modelId: string
  lastVerifiedAt: number | null
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
