import { create } from "zustand"
import type { Settings } from "@/types"

interface SettingsState extends Settings {
  setBaseUrl: (baseUrl: string) => void
  setApiKey: (apiKey: string) => void
  setModel: (model: string) => void
  setVoice: (voice: string) => void
  setSpeed: (speed: number) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  baseUrl: "",
  apiKey: "",
  model: "",
  voice: "",
  speed: 1,

  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setApiKey: (apiKey) => set({ apiKey }),
  setModel: (model) => set({ model }),
  setVoice: (voice) => set({ voice }),
  setSpeed: (speed) => set({ speed }),
  updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
}))
