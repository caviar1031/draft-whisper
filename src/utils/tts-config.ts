import type { ApiConfig, TtsMode } from "@/types"
import { resolveCapability } from "./provider-catalog.ts"

interface TtsConfiguration {
  apiConfigId: string | null
  mode: TtsMode
  voiceDesignPrompt: string
  voiceClonePath: string | null
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
  if (project.mode === "voice-design" && !project.voiceDesignPrompt.trim()) {
    return "errors.voiceDesignRequired"
  }
  if (project.mode === "voice-clone" && !project.voiceClonePath) {
    return "errors.voiceSampleRequired"
  }
  return null
}
