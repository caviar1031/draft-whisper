import { loadApiKey, saveApiKey } from "@/services/tts"
import type { ModelConfig, Settings } from "@/types"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState extends Required<Settings> {
  models: ModelConfig[]
  apiKeyLoaded: boolean
  setBaseUrl: (baseUrl: string) => void
  setApiKey: (apiKey: string) => void
  setConcurrency: (concurrency: number) => void
  setProject: (project: string | null) => void
  addModel: (config: ModelConfig) => void
  removeModel: (id: string) => void
  updateModel: (id: string, updates: Partial<Pick<ModelConfig, "name" | "mode">>) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: "",
      apiKey: "",
      concurrency: 1,
      project: null,
      models: [],
      apiKeyLoaded: false,

      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => {
        set({ apiKey })
        // 异步写入 Keychain，失败仅 log
        saveApiKey(apiKey).catch((e) => console.error("saveApiKey failed:", e))
      },
      setConcurrency: (concurrency) => set({ concurrency }),
      setProject: (project) => set({ project }),
      addModel: (config) => set((state) => ({ models: [...state.models, config] })),
      removeModel: (id) => set((state) => ({ models: state.models.filter((m) => m.id !== id) })),
      updateModel: (id, updates) =>
        set((state) => ({
          models: state.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: "dw-settings",
      // apiKey 不写入 localStorage，由 Keychain 管理
      partialize: (state) => {
        const { apiKey: _, apiKeyLoaded: __, ...rest } = state
        return rest
      },
      onRehydrateStorage: () => (state) => {
        // store hydration 完成后，从 Keychain 加载 apiKey
        if (state) {
          loadApiKey()
            .then((key) => {
              // 直接 setState 而非调用 setApiKey，避免回写 Keychain
              if (key) useSettingsStore.setState({ apiKey: key })
              useSettingsStore.setState({ apiKeyLoaded: true })
            })
            .catch((e) => {
              console.error("loadApiKey failed:", e)
              useSettingsStore.setState({ apiKeyLoaded: true })
            })
        }
      },
    },
  ),
)
