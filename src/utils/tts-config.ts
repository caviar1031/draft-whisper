import type { ApiConfig } from "@/types/api-config"
import type { ProviderId, TtsMode } from "@/types/tts"
import { resolveCapability } from "./provider-catalog.ts"

export interface TtsConfiguration {
  apiConfigId: string | null
  mode: TtsMode
  voice: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
}

export function resolvePerformancePrompt(
  provider: ProviderId,
  mode: TtsMode,
  sentenceStyleInstruction: string,
  projectPerformancePrompt: string,
): string {
  if (provider === "mimo" && mode === "basic") return sentenceStyleInstruction
  return projectPerformancePrompt
}

export function getTtsConfigurationError(
  project: TtsConfiguration,
  apiConfigs: ApiConfig[],
  apiKeys?: Record<string, string>,
): string | null {
  if (!project.apiConfigId) return "errors.selectApiConfig"
  const config = apiConfigs.find((item) => item.id === project.apiConfigId)
  if (!config) return "errors.apiConfigMissing"
  if (!resolveCapability(config, project.mode)) return "errors.capabilityUnavailable"
  if (apiKeys && !apiKeys[config.id]) return "errors.apiKeyMissing"
  if (project.mode === "basic" && !config.voices.some((voice) => voice.id === project.voice)) {
    return "errors.voiceUnavailable"
  }
  if (project.mode === "voice-design" && !project.voiceDesignPrompt.trim()) {
    return "errors.voiceDesignRequired"
  }
  if (project.mode === "voice-clone" && !project.voiceClonePath) {
    return "errors.voiceSampleRequired"
  }
  return null
}
