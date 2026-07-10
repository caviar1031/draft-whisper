import { deleteApiKey, loadApiKey, saveApiKey } from "@/services/tts"
import type { ModelConfig, Settings } from "@/types"
import { SerialDebouncedSaver } from "@/utils/serial-debounced-saver"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState extends Required<Settings> {
  models: ModelConfig[]
  apiKeyLoaded: boolean
  apiKeySaveState: "idle" | "pending" | "saving" | "saved" | "error"
  apiKeySaveError: string | null
  setBaseUrl: (baseUrl: string) => void
  setApiKey: (apiKey: string) => void
  setConcurrency: (concurrency: number) => void
  setProject: (project: string | null) => void
  addModel: (config: ModelConfig) => void
  removeModel: (id: string) => void
  updateModel: (id: string, updates: Partial<Pick<ModelConfig, "name" | "mode">>) => void
  updateSettings: (settings: Partial<Settings>) => void
  flushApiKey: () => Promise<void>
}

type PersistedSettings = Pick<SettingsState, "baseUrl" | "concurrency" | "project" | "models">

const apiKeySaver = new SerialDebouncedSaver(
  async (apiKey: string) => {
    if (apiKey.length > 0) await saveApiKey(apiKey)
    else await deleteApiKey()
  },
  500,
  {
    onPending: () => useSettingsStore.setState({ apiKeySaveState: "pending" }),
    onSaving: () => useSettingsStore.setState({ apiKeySaveState: "saving" }),
    onSuccess: () => useSettingsStore.setState({ apiKeySaveState: "saved", apiKeySaveError: null }),
    onError: (error) =>
      useSettingsStore.setState({
        apiKeySaveState: "error",
        apiKeySaveError: error instanceof Error ? error.message : String(error),
      }),
  },
)

export const useSettingsStore = create<SettingsState>()(
  persist<SettingsState, [], [], PersistedSettings>(
    (set) => ({
      baseUrl: "",
      apiKey: "",
      concurrency: 1,
      project: null,
      models: [],
      apiKeyLoaded: false,
      apiKeySaveState: "idle",
      apiKeySaveError: null,

      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => {
        set({ apiKey, apiKeySaveError: null })
        apiKeySaver.schedule(apiKey)
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
      flushApiKey: () => apiKeySaver.flush(),
    }),
    {
      name: "dw-settings",
      // apiKey 不写入 localStorage，由 Keychain 管理
      partialize: (state) => {
        const { baseUrl, concurrency, project, models } = state
        return { baseUrl, concurrency, project, models }
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
              useSettingsStore.setState({
                apiKeyLoaded: true,
                apiKeySaveState: "error",
                apiKeySaveError: e instanceof Error ? e.message : String(e),
              })
            })
        }
      },
    },
  ),
)
