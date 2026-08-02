import { deleteApiKey, loadApiKey, migrateLegacyApiKey, saveApiKey } from "@/services/tts"
import type { ApiConfig, LanguagePreference, Settings, ThemePreference, TtsMode } from "@/types"
import { createApiConfig } from "@/utils/provider-catalog"
import {
  LEGACY_API_CONFIG_ID,
  migratePersistedSettings,
  normalizeConcurrency,
} from "@/utils/settings-validation"
import { create } from "zustand"
import { persist } from "zustand/middleware"

type PersistedSettings = Required<Settings>

interface SettingsState extends PersistedSettings {
  apiKeys: Record<string, string>
  apiKeysLoaded: boolean
  apiKeyErrors: Record<string, string | null>
  setLanguage: (language: LanguagePreference) => void
  setTheme: (theme: ThemePreference) => void
  setConcurrency: (concurrency: number) => void
  setProject: (project: string | null) => void
  saveApiConfig: (config: ApiConfig, apiKey?: string) => Promise<void>
  deleteApiConfig: (configId: string) => Promise<string | null>
  setDefaultApiConfig: (configId: string) => void
  setCapabilityVerified: (configId: string, mode: TtsMode, verifiedAt: number | null) => void
  loadAllApiKeys: () => Promise<void>
}

function nextDefault(configs: ApiConfig[]): string | null {
  return [...configs].sort((a, b) => a.createdAt - b.createdAt)[0]?.id ?? null
}

export const useSettingsStore = create<SettingsState>()(
  persist<SettingsState, [], [], PersistedSettings>(
    (set, get) => ({
      language: "system",
      theme: "system",
      concurrency: 1,
      project: null,
      apiConfigs: [],
      defaultApiConfigId: null,
      apiKeys: {},
      apiKeysLoaded: false,
      apiKeyErrors: {},

      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setConcurrency: (concurrency) => set({ concurrency: normalizeConcurrency(concurrency) }),
      setProject: (project) => set({ project }),

      saveApiConfig: async (config, apiKey) => {
        const existing = get().apiConfigs.find((item) => item.id === config.id)
        if (apiKey?.trim()) {
          try {
            await saveApiKey(config.id, apiKey.trim())
            set((state) => ({
              apiKeys: { ...state.apiKeys, [config.id]: apiKey.trim() },
              apiKeyErrors: { ...state.apiKeyErrors, [config.id]: null },
            }))
          } catch (error) {
            set((state) => ({
              apiKeyErrors: {
                ...state.apiKeyErrors,
                [config.id]: error instanceof Error ? error.message : String(error),
              },
            }))
            throw error
          }
        } else if (!existing && !get().apiKeys[config.id]) {
          throw new Error("settings.errors.apiKeyRequired")
        }

        set((state) => {
          const apiConfigs = existing
            ? state.apiConfigs.map((item) => (item.id === config.id ? config : item))
            : [...state.apiConfigs, config]
          return {
            apiConfigs,
            defaultApiConfigId: state.defaultApiConfigId ?? config.id,
          }
        })
      },

      deleteApiConfig: async (configId) => {
        await deleteApiKey(configId)
        let replacement: string | null = null
        set((state) => {
          const apiConfigs = state.apiConfigs.filter((config) => config.id !== configId)
          replacement =
            state.defaultApiConfigId === configId
              ? nextDefault(apiConfigs)
              : state.defaultApiConfigId
          const { [configId]: _removedKey, ...apiKeys } = state.apiKeys
          const { [configId]: _removedError, ...apiKeyErrors } = state.apiKeyErrors
          return { apiConfigs, defaultApiConfigId: replacement, apiKeys, apiKeyErrors }
        })
        return replacement
      },

      setDefaultApiConfig: (configId) => {
        if (get().apiConfigs.some((config) => config.id === configId)) {
          set({ defaultApiConfigId: configId })
        }
      },

      setCapabilityVerified: (configId, mode, verifiedAt) => {
        set((state) => ({
          apiConfigs: state.apiConfigs.map((config) =>
            config.id === configId
              ? {
                  ...config,
                  capabilities: {
                    ...config.capabilities,
                    [mode]: { ...config.capabilities[mode], lastVerifiedAt: verifiedAt },
                  },
                }
              : config,
          ),
        }))
      },

      loadAllApiKeys: async () => {
        let configs = get().apiConfigs
        let migratedKey: string | null = null
        if (configs.length === 0 || configs.some((config) => config.id === LEGACY_API_CONFIG_ID)) {
          migratedKey = await migrateLegacyApiKey(LEGACY_API_CONFIG_ID)
          if (migratedKey && configs.length === 0) {
            const migrated = createApiConfig(LEGACY_API_CONFIG_ID, 0)
            configs = [migrated]
            set({ apiConfigs: configs, defaultApiConfigId: migrated.id })
          }
        }

        const entries = await Promise.all(
          configs.map(async (config) => {
            if (config.id === LEGACY_API_CONFIG_ID && migratedKey) {
              return [config.id, migratedKey] as const
            }
            try {
              return [config.id, (await loadApiKey(config.id)) ?? ""] as const
            } catch (error) {
              set((state) => ({
                apiKeyErrors: {
                  ...state.apiKeyErrors,
                  [config.id]: error instanceof Error ? error.message : String(error),
                },
              }))
              return [config.id, ""] as const
            }
          }),
        )
        set({ apiKeys: Object.fromEntries(entries), apiKeysLoaded: true })
      },
    }),
    {
      name: "dw-settings",
      version: 4,
      migrate: migratePersistedSettings,
      partialize: (state) => ({
        language: state.language,
        theme: state.theme,
        concurrency: state.concurrency,
        project: state.project,
        apiConfigs: state.apiConfigs,
        defaultApiConfigId: state.defaultApiConfigId,
      }),
      onRehydrateStorage: () => (state) => {
        void state?.loadAllApiKeys().catch((error) => {
          console.error("Failed to load API keys:", error)
          useSettingsStore.setState({ apiKeysLoaded: true })
        })
      },
    },
  ),
)
