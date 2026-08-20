import type { VoiceDesignPreset } from "@/types/voice-resource"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface VoiceDesignState {
  designs: VoiceDesignPreset[]
  saveDesign: (design: VoiceDesignPreset) => void
  removeDesign: (id: string) => void
}

export const useVoiceDesignStore = create<VoiceDesignState>()(
  persist(
    (set) => ({
      designs: [],
      saveDesign: (design) =>
        set((state) => ({
          designs: state.designs.some((item) => item.id === design.id)
            ? state.designs.map((item) => (item.id === design.id ? design : item))
            : [...state.designs, design],
        })),
      removeDesign: (id) =>
        set((state) => ({ designs: state.designs.filter((design) => design.id !== id) })),
    }),
    { name: "dw-voice-designs", version: 1 },
  ),
)
