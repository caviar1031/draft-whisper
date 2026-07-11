import type { VoiceCloneSample } from "@/types"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface VoiceSampleState {
  samples: VoiceCloneSample[]
  addSample: (sample: VoiceCloneSample) => void
  removeSample: (id: string) => void
  renameSample: (id: string, name: string) => void
}

export const useVoiceSampleStore = create<VoiceSampleState>()(
  persist(
    (set) => ({
      samples: [],

      addSample: (sample) => {
        set((state) => ({ samples: [...state.samples, sample] }))
      },

      removeSample: (id) => {
        set((state) => ({
          samples: state.samples.filter((s) => s.id !== id),
        }))
      },

      renameSample: (id, name) => {
        set((state) => ({
          samples: state.samples.map((s) => (s.id === id ? { ...s, name } : s)),
        }))
      },
    }),
    {
      name: "dw-voice-samples",
      version: 2,
      migrate: (persisted) => {
        const state = persisted as { samples?: Array<Record<string, unknown>> }
        return {
          samples: (state.samples ?? [])
            .filter((sample) => sample.format === "wav" || sample.format === "mp3")
            .map((sample) => ({
              ...sample,
              durationMs: typeof sample.durationMs === "number" ? sample.durationMs : null,
            })),
        }
      },
    },
  ),
)
