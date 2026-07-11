import type { ApiConfig, LanguagePreference, ProviderId, TtsMode } from "@/types"
import { PROVIDERS, TTS_MODES, createApiConfig } from "./provider-catalog.ts"

export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 4
export const LEGACY_API_CONFIG_ID = "migrated-mimo"

export interface PersistedSettingsData {
  language: LanguagePreference
  concurrency: number
  project: string | null
  apiConfigs: ApiConfig[]
  defaultApiConfigId: string | null
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

function normalizeApiConfig(value: unknown): ApiConfig | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const provider: ProviderId = raw.provider === "mimo" ? "mimo" : "mimo"
  const fallback = createApiConfig(typeof raw.id === "string" ? raw.id : "", 0)
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
    capabilities[mode] = {
      enabled: typeof mapping.enabled === "boolean" ? mapping.enabled : true,
      modelId:
        typeof mapping.modelId === "string"
          ? mapping.modelId
          : PROVIDERS[provider].defaultModels[mode],
      lastVerifiedAt: typeof mapping.lastVerifiedAt === "number" ? mapping.lastVerifiedAt : null,
    }
  }
  return {
    id: fallback.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : PROVIDERS[provider].name,
    provider,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : PROVIDERS[provider].defaultBaseUrl,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    capabilities,
  }
}

export function migratePersistedSettings(value: unknown): PersistedSettingsData {
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
    concurrency: normalizeConcurrency(old.concurrency),
    project: typeof old.project === "string" || old.project === null ? old.project : null,
    apiConfigs,
    defaultApiConfigId,
  }
}

export function getSystemLanguage(language = navigator.language): "zh-CN" | "en" {
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
  return null
}
