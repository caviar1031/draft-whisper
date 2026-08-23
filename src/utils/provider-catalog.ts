import type { ApiConfig, ApiVoice, CapabilityMappings } from "@/types/api-config"
import type { AudioFormat, ProviderId, TtsMode } from "@/types/tts"

export const AUDIO_FORMATS: readonly AudioFormat[] = ["mp3", "wav"]

export interface ProviderDefinition {
  id: ProviderId
  name: string
  shortLabel: string
  defaultBaseUrl: string
  docsUrl?: string
  defaultModels: Record<TtsMode, string>
  supportedModes: TtsMode[]
  defaultVoices: ApiVoice[]
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  mimo: {
    id: "mimo",
    name: "Xiaomi MiMo",
    shortLabel: "Mi",
    defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    docsUrl: "https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5",
    defaultModels: {
      basic: "mimo-v2.5-tts",
      "voice-design": "mimo-v2.5-tts-voicedesign",
      "voice-clone": "mimo-v2.5-tts-voiceclone",
    },
    supportedModes: ["basic", "voice-design", "voice-clone"],
    defaultVoices: [
      { id: "冰糖", name: "冰糖 · 女声 / 中文" },
      { id: "茉莉", name: "茉莉 · 女声 / 中文" },
      { id: "苏打", name: "苏打 · 男声 / 中文" },
      { id: "白桦", name: "白桦 · 男声 / 中文" },
      { id: "Mia", name: "Mia · Female / English" },
      { id: "Chloe", name: "Chloe · Female / English" },
      { id: "Milo", name: "Milo · Male / English" },
      { id: "Dean", name: "Dean · Male / English" },
      { id: "mimo_default", name: "Default" },
    ],
  },
  "fish-audio": {
    id: "fish-audio",
    name: "Fish Audio",
    shortLabel: "Fi",
    defaultBaseUrl: "https://api.fish.audio/v1/tts",
    docsUrl: "https://docs.fish.audio/developer-guide/getting-started/quickstart",
    defaultModels: {
      basic: "s2.1-pro-free",
      "voice-design": "",
      "voice-clone": "",
    },
    supportedModes: ["basic"],
    defaultVoices: [
      { id: "ca3007f96ae7499ab87d27ea3599956a", name: "E-Girl Voice" },
      { id: "9a9cf47702da476aa4629e2506d4a857", name: "Energetic Male" },
    ],
  },
  custom: {
    id: "custom",
    name: "Custom API",
    shortLabel: "Cu",
    defaultBaseUrl: "",
    defaultModels: {
      basic: "",
      "voice-design": "",
      "voice-clone": "",
    },
    supportedModes: ["basic"],
    defaultVoices: [{ id: "", name: "" }],
  },
}

export const TTS_MODES: TtsMode[] = ["basic", "voice-design", "voice-clone"]

export function createDefaultCapabilities(provider: ProviderId): CapabilityMappings {
  const definition = PROVIDERS[provider]
  const models = definition.defaultModels
  return {
    basic: {
      enabled: definition.supportedModes.includes("basic"),
      modelId: models.basic,
      formatTests: {},
    },
    "voice-design": {
      enabled: definition.supportedModes.includes("voice-design"),
      modelId: models["voice-design"],
      formatTests: {},
    },
    "voice-clone": {
      enabled: definition.supportedModes.includes("voice-clone"),
      modelId: models["voice-clone"],
      formatTests: {},
    },
  }
}

export function createApiConfig(
  id: string,
  now = Date.now(),
  provider: ProviderId = "mimo",
): ApiConfig {
  const definition = PROVIDERS[provider]
  return {
    id,
    name: provider === "mimo" ? "MiMo" : provider === "custom" ? "Custom API" : definition.name,
    provider,
    baseUrl: definition.defaultBaseUrl,
    createdAt: now,
    capabilities: createDefaultCapabilities(provider),
    voices: structuredClone(definition.defaultVoices),
  }
}

export function applyProviderPreset(config: ApiConfig, provider: ProviderId): ApiConfig {
  const preset = createApiConfig(config.id, config.createdAt, provider)
  return { ...preset, id: config.id, createdAt: config.createdAt }
}

export function resolveConfigVoice(config: ApiConfig | undefined, currentVoice: string): string {
  if (!config) return currentVoice
  return config.voices.some((voice) => voice.id === currentVoice)
    ? currentVoice
    : (config.voices[0]?.id ?? "")
}

export function resolveCapability(config: ApiConfig | undefined, mode: TtsMode) {
  if (!config) return null
  if (!PROVIDERS[config.provider].supportedModes.includes(mode)) return null
  const mapping = config.capabilities[mode]
  if (!mapping.enabled || !mapping.modelId.trim()) return null
  return mapping
}

/** Custom endpoints need format probing; built-in providers currently emit WAV. */
export function getFormatsToTest(provider: ProviderId): readonly AudioFormat[] {
  return provider === "custom" ? AUDIO_FORMATS : ["wav"]
}

/** Return formats that are known to be playable for this capability. */
export function getAvailableAudioFormats(
  config: ApiConfig | undefined,
  mode: TtsMode,
): AudioFormat[] {
  if (!config) return []
  if (config.provider !== "custom") return ["wav"]
  const mapping = config.capabilities[mode]
  const modelId = mapping.modelId.trim()
  const baseUrl = config.baseUrl.trim()
  const formatTests = mapping.formatTests ?? {}
  return AUDIO_FORMATS.filter((format) => {
    const result = formatTests[format]
    return result?.supported === true && result.modelId === modelId && result.baseUrl === baseUrl
  })
}

export function getDefaultAudioFormat(provider: ProviderId): AudioFormat {
  return provider === "custom" ? "mp3" : "wav"
}

export function resolveAudioFormat(
  config: ApiConfig | undefined,
  mode: TtsMode,
  preferred: AudioFormat,
): AudioFormat {
  const available = getAvailableAudioFormats(config, mode)
  if (available.includes(preferred)) return preferred
  return available[0] ?? getDefaultAudioFormat(config?.provider ?? "mimo")
}

export function isAudioFormatAvailable(
  config: ApiConfig | undefined,
  mode: TtsMode,
  format: AudioFormat,
): boolean {
  return getAvailableAudioFormats(config, mode).includes(format)
}
