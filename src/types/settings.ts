import type { ApiConfig, LanguagePreference } from "./api-config"

export interface Settings {
  language?: LanguagePreference
  concurrency?: number
  project?: string | null
  apiConfigs?: ApiConfig[]
  defaultApiConfigId?: string | null
}
