import type { ApiConfig } from "./api-config"

export type ThemePreference = "system" | "light" | "dark"
export type LanguagePreference = "system" | "zh-CN" | "en"

export interface Settings {
  language: LanguagePreference
  theme: ThemePreference
  concurrency: number
  project: string | null
  apiConfigs: ApiConfig[]
  defaultApiConfigId: string | null
}
