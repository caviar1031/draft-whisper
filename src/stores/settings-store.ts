import type { Settings } from "@/types"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState extends Required<Settings> {
  setBaseUrl: (baseUrl: string) => void
  setApiKey: (apiKey: string) => void
  setConcurrency: (concurrency: number) => void
  setProject: (project: string | null) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: "",
      apiKey: "",
      concurrency: 1,
      project: null,

      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setConcurrency: (concurrency) => set({ concurrency }),
      setProject: (project) => set({ project }),
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    { name: "dw-settings" },
  ),
)
