import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface VoiceSample {
  id: string
  name: string
  filePath: string
  createdAt: number
  format?: "wav" | "mp3"
  mimeType?: "audio/wav" | "audio/mpeg"
  byteSize?: number
  encodedSize?: number
  source?: "uploaded" | "voice-design"
  designPrompt?: string
}

interface VoiceSampleState {
  samples: VoiceSample[]
  addSample: (sample: VoiceSample) => void
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
    { name: "dw-voice-samples" },
  ),
)
