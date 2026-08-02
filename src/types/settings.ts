import type { ApiConfig, LanguagePreference } from "./api-config"

export type ThemePreference = "system" | "light" | "dark"

export interface Settings {
  language?: LanguagePreference
  theme?: ThemePreference
  concurrency?: number
  project?: string | null
  apiConfigs?: ApiConfig[]
  defaultApiConfigId?: string | null
}
