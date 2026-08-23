import type { ApiConfig, ApiVoice } from "@/types/api-config"
import type { LanguagePreference, Settings, ThemePreference } from "@/types/settings"
import type { AudioFormatTestResults, ProviderId, TtsMode } from "@/types/tts"
import { PROVIDERS, TTS_MODES, createApiConfig } from "./provider-catalog.ts"

export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 16
export const LEGACY_API_CONFIG_ID = "migrated-mimo"

export function createDefaultSettings(): Settings {
  return {
    language: "system",
    theme: "system",
    concurrency: 1,
    project: null,
    apiConfigs: [],
    defaultApiConfigId: null,
  }
}

export function normalizeConcurrency(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return MIN_CONCURRENCY
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.floor(number)))
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function normalizeLanguage(value: unknown): LanguagePreference {
  return value === "zh-CN" || value === "en" || value === "system" ? value : "system"
}

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system"
}

function normalizeApiConfig(value: unknown): ApiConfig | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const provider: ProviderId =
    raw.provider === "fish-audio" || raw.provider === "custom" ? raw.provider : "mimo"
  const fallback = createApiConfig(typeof raw.id === "string" ? raw.id : "", 0, provider)
  if (!fallback.id) return null
  const rawCapabilities =
    raw.capabilities && typeof raw.capabilities === "object"
      ? (raw.capabilities as Record<string, unknown>)
      : {}
  const capabilities = { ...fallback.capabilities }
  for (const mode of TTS_MODES) {
    const entry = rawCapabilities[mode]
    if (!entry || typeof entry !== "object") continue
    const mapping = entry as Record<string, unknown>
    const rawFormatTests =
      mapping.formatTests && typeof mapping.formatTests === "object"
        ? (mapping.formatTests as Record<string, unknown>)
        : {}
    const formatTests: AudioFormatTestResults = {}
    for (const format of ["mp3", "wav"] as const) {
      const result = rawFormatTests[format]
      if (!result || typeof result !== "object") continue
      const candidate = result as Record<string, unknown>
      if (
        typeof candidate.supported !== "boolean" ||
        typeof candidate.modelId !== "string" ||
        typeof candidate.baseUrl !== "string"
      ) {
        continue
      }
      formatTests[format] = {
        supported: candidate.supported,
        testedAt: typeof candidate.testedAt === "number" ? candidate.testedAt : 0,
        modelId: candidate.modelId.trim(),
        baseUrl: candidate.baseUrl.trim(),
        ...(typeof candidate.error === "string" ? { error: candidate.error } : {}),
      }
    }
    capabilities[mode] = {
      enabled:
        PROVIDERS[provider].supportedModes.includes(mode) &&
        (typeof mapping.enabled === "boolean" ? mapping.enabled : true),
      modelId:
        typeof mapping.modelId === "string"
          ? mapping.modelId
          : PROVIDERS[provider].defaultModels[mode],
      formatTests,
    }
  }
  const voices: ApiVoice[] = Array.isArray(raw.voices)
    ? raw.voices.flatMap((voice) => {
        if (!voice || typeof voice !== "object") return []
        const candidate = voice as Record<string, unknown>
        if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return []
        return [{ id: candidate.id, name: candidate.name }]
      })
    : fallback.voices
  return {
    id: fallback.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : PROVIDERS[provider].name,
    provider,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : PROVIDERS[provider].defaultBaseUrl,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    capabilities,
    voices,
  }
}

export function migratePersistedSettings(value: unknown): Settings {
  const defaults = createDefaultSettings()
  const old = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  let apiConfigs = Array.isArray(old.apiConfigs)
    ? old.apiConfigs
        .map(normalizeApiConfig)
        .filter((config): config is ApiConfig => Boolean(config))
    : []

  if (apiConfigs.length === 0 && typeof old.baseUrl === "string" && old.baseUrl.trim()) {
    const migrated = createApiConfig(LEGACY_API_CONFIG_ID, 0)
    migrated.baseUrl = old.baseUrl
    apiConfigs = [migrated]
  }

  const requestedDefault =
    typeof old.defaultApiConfigId === "string" ? old.defaultApiConfigId : null
  const defaultApiConfigId = apiConfigs.some((config) => config.id === requestedDefault)
    ? requestedDefault
    : (apiConfigs[0]?.id ?? null)

  return {
    language: normalizeLanguage(old.language),
    theme: normalizeTheme(old.theme),
    concurrency: normalizeConcurrency(old.concurrency),
    project:
      typeof old.project === "string" || old.project === null ? old.project : defaults.project,
    apiConfigs,
    defaultApiConfigId,
  }
}

export function getSystemLanguage(
  language = typeof navigator !== "undefined" ? navigator.language : "en",
): "zh-CN" | "en" {
  return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
}

export function resolveLanguage(preference: LanguagePreference, systemLanguage?: string) {
  return preference === "system" ? getSystemLanguage(systemLanguage) : preference
}

export function validateApiConfig(config: ApiConfig): string | null {
  if (!config.name.trim()) return "settings.errors.nameRequired"
  if (!isValidHttpUrl(config.baseUrl)) return "settings.errors.invalidBaseUrl"
  const enabled = TTS_MODES.filter((mode) => config.capabilities[mode].enabled)
  if (enabled.length === 0) return "settings.errors.capabilityRequired"
  if (enabled.some((mode: TtsMode) => !config.capabilities[mode].modelId.trim())) {
    return "settings.errors.modelRequired"
  }
  if (config.capabilities.basic.enabled) {
    if (config.voices.length === 0) return "settings.errors.voiceRequired"
    if (config.voices.some((voice) => !voice.id.trim() || !voice.name.trim())) {
      return "settings.errors.voiceFieldsRequired"
    }
    const voiceIds = config.voices.map((voice) => voice.id.trim())
    if (new Set(voiceIds).size !== voiceIds.length) return "settings.errors.voiceIdDuplicate"
  }
  return null
}
