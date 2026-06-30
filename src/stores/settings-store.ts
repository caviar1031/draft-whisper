import type { Settings } from "@/types"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SettingsState extends Settings {
  setBaseUrl: (baseUrl: string) => void
  setApiKey: (apiKey: string) => void
  setModel: (model: string) => void
  setVoice: (voice: string) => void
  setSpeed: (speed: number) => void
  setConcurrency: (concurrency: number) => void
  setProject: (project: string | null) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // MVP 默认使用小米 MiMo v2.5 TTS 协议
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "",
      model: "mimo-v2.5-tts",
      voice: "冰糖",
      speed: 1,
      concurrency: 1,
      project: null,

      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      setVoice: (voice) => set({ voice }),
      setSpeed: (speed) => set({ speed }),
      setConcurrency: (concurrency) => set({ concurrency }),
      setProject: (project) => set({ project }),
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    { name: "dw-settings" },
  ),
)
