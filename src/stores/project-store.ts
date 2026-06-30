import type { Project, Sentence } from "@/types"
import { create } from "zustand"

interface ProjectState extends Project {
  setVoice: (voice: string) => void
  setModel: (model: string) => void
  setSpeed: (speed: number) => void
  setSentences: (sentences: Sentence[]) => void
  updateSentence: (id: string, updates: Partial<Sentence>) => void
  addSentence: (sentence: Sentence) => void
  removeSentence: (id: string) => void
  switchAudioVersion: (id: string, historyIndex: number) => void
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
  switchAudioVersion: (id, historyIndex) =>
    set((state) => ({
      sentences: state.sentences.map((s) => {
        if (s.id !== id) return s
        const version = s.audioHistory[historyIndex]
        if (!version) return s
        return { ...s, audioPath: version.audioPath, duration: null }
      }),
    })),
}))
