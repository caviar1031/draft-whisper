import type { ApiConfig, CapabilityMappings, ProviderId, TtsMode } from "@/types"

export interface ProviderDefinition {
  id: ProviderId
  name: string
  defaultBaseUrl: string
  docsUrl: string
  defaultModels: Record<TtsMode, string>
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  mimo: {
    id: "mimo",
    name: "Xiaomi MiMo",
    defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    docsUrl: "https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5",
    defaultModels: {
      basic: "mimo-v2.5-tts",
      "voice-design": "mimo-v2.5-tts-voicedesign",
      "voice-clone": "mimo-v2.5-tts-voiceclone",
    },
  },
}

export const TTS_MODES: TtsMode[] = ["basic", "voice-design", "voice-clone"]

export function createDefaultCapabilities(provider: ProviderId): CapabilityMappings {
  const models = PROVIDERS[provider].defaultModels
  return {
    basic: { enabled: true, modelId: models.basic, lastVerifiedAt: null },
    "voice-design": {
      enabled: true,
      modelId: models["voice-design"],
      lastVerifiedAt: null,
    },
    "voice-clone": {
      enabled: true,
      modelId: models["voice-clone"],
      lastVerifiedAt: null,
    },
  }
}

export function createApiConfig(id: string, now = Date.now()): ApiConfig {
  const provider: ProviderId = "mimo"
  return {
    id,
    name: "MiMo",
    provider,
    baseUrl: PROVIDERS[provider].defaultBaseUrl,
    createdAt: now,
    capabilities: createDefaultCapabilities(provider),
  }
}

export function resolveCapability(config: ApiConfig | undefined, mode: TtsMode) {
  if (!config) return null
  const mapping = config.capabilities[mode]
  if (!mapping.enabled || !mapping.modelId.trim()) return null
  return mapping
}
