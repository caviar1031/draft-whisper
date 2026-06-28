import { create } from "zustand"
import type { Project, Sentence } from "@/types"

interface ProjectState extends Project {
  setVoice: (voice: string) => void
  setModel: (model: string) => void
  setSpeed: (speed: number) => void
  setSentences: (sentences: Sentence[]) => void
  updateSentence: (id: string, updates: Partial<Sentence>) => void
  addSentence: (sentence: Sentence) => void
  removeSentence: (id: string) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  voice: "",
  model: "",
  speed: 1,
  sentences: [],

  setVoice: (voice) => set({ voice }),
  setModel: (model) => set({ model }),
  setSpeed: (speed) => set({ speed }),
  setSentences: (sentences) => set({ sentences }),
  updateSentence: (id, updates) =>
    set((state) => ({
      sentences: state.sentences.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),
  addSentence: (sentence) =>
    set((state) => ({
      sentences: [...state.sentences, sentence],
    })),
  removeSentence: (id) =>
    set((state) => ({
      sentences: state.sentences.filter((s) => s.id !== id),
    })),
}))
