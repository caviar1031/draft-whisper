import type { TtsMode } from "./project"

export type ProviderId = "mimo"
export type LanguagePreference = "system" | "zh-CN" | "en"

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
}
