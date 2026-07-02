import type { ModelConfig, Settings } from "@/types"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState extends Required<Settings> {
  models: ModelConfig[]
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

      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setConcurrency: (concurrency) => set({ concurrency }),
      setProject: (project) => set({ project }),
      addModel: (config) =>
        set((state) => ({ models: [...state.models, config] })),
      removeModel: (id) =>
        set((state) => ({ models: state.models.filter((m) => m.id !== id) })),
      updateModel: (id, updates) =>
        set((state) => ({
          models: state.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    { name: "dw-settings" },
  ),
)
