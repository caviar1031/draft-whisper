import type { Project, Sentence, TtsMode } from "@/types"
import { create } from "zustand"

const STORAGE_PREFIX = "dw-project:"
const DEFAULT_KEY = "__default__"
const LEGACY_KEY = "dw-project"

function storageKey(project: string | null): string {
  return `${STORAGE_PREFIX}${project ?? DEFAULT_KEY}`
}

/** 重置瞬态状态：generating/queued → 根据 audioPath 判断 */
function normalizeSentences(sentences: Sentence[]): Sentence[] {
  return sentences.map((s) => {
    if (s.status === "generating" || s.status === "queued") {
      return { ...s, status: s.audioPath ? "completed" : "pending" }
    }
    return s
  })
}

interface ProjectData {
  mode: TtsMode
  model: string
  voice: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
  sentences: Sentence[]
}

const DEFAULT_PROJECT_DATA: ProjectData = {
  mode: "basic",
  model: "mimo-v2.5-tts",
  voice: "冰糖",
  voiceDesignPrompt: "",
  voiceClonePath: null,
  sentences: [],
}

/** 从 localStorage 加载指定项目的数据 */
function loadProjectData(project: string | null): ProjectData {
  try {
    const key = storageKey(project)
    let raw = localStorage.getItem(key)

    // 迁移旧版数据
    if (!raw && project === null) {
      raw = localStorage.getItem(LEGACY_KEY)
      if (raw) {
        localStorage.setItem(key, raw)
        localStorage.removeItem(LEGACY_KEY)
      }
    }

    if (!raw) return { ...DEFAULT_PROJECT_DATA }
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // 兼容旧版 Zustand persist 格式 { state: { sentences: [...] } }
    const state = (parsed.state as Record<string, unknown>) ?? parsed
    const sentences = (state.sentences as Sentence[]) ?? []

    return {
      mode: (state.mode as TtsMode) ?? "basic",
      model: (state.model as string) ?? "mimo-v2.5-tts",
      voice: (state.voice as string) ?? "冰糖",
      voiceDesignPrompt: (state.voiceDesignPrompt as string) ?? "",
      voiceClonePath: (state.voiceClonePath as string | null) ?? null,
      sentences: normalizeSentences(sentences),
    }
  } catch {
    return { ...DEFAULT_PROJECT_DATA }
  }
}

/** 将当前项目数据保存到 localStorage */
function saveProjectData(project: string | null, data: ProjectData): void {
  try {
    localStorage.setItem(storageKey(project), JSON.stringify(data))
  } catch {
    // localStorage 满或不可用时静默失败
  }
}

interface ProjectState extends Project {
  currentProject: string | null
  setMode: (mode: TtsMode) => void
  setModel: (model: string) => void
  setVoice: (voice: string) => void
  setVoiceDesignPrompt: (prompt: string) => void
  setVoiceClonePath: (path: string | null) => void
  setSentences: (sentences: Sentence[]) => void
  updateSentence: (id: string, updates: Partial<Sentence>) => void
  addSentence: (sentence: Sentence) => void
  removeSentence: (id: string) => void
  switchAudioVersion: (id: string, historyIndex: number) => void
  /** 切换项目：先保存当前，再加载目标 */
  loadProject: (project: string | null) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  mode: "basic",
  model: "mimo-v2.5-tts",
  voice: "冰糖",
  voiceDesignPrompt: "",
  voiceClonePath: null,
  sentences: [],

  setMode: (mode) => {
    set({ mode })
    saveCurrentProject(get())
  },
  setModel: (model) => {
    set({ model })
    saveCurrentProject(get())
  },
  setVoice: (voice) => {
    set({ voice })
    saveCurrentProject(get())
  },
  setVoiceDesignPrompt: (voiceDesignPrompt) => {
    set({ voiceDesignPrompt })
    saveCurrentProject(get())
  },
  setVoiceClonePath: (voiceClonePath) => {
    set({ voiceClonePath })
    saveCurrentProject(get())
  },
  setSentences: (sentences) => {
    set({ sentences })
    saveCurrentProject(get())
  },
  updateSentence: (id, updates) => {
    set((state) => ({
      sentences: state.sentences.map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      ),
    }))
    saveCurrentProject(get())
  },
  addSentence: (sentence) => {
    set((state) => ({
      sentences: [...state.sentences, sentence],
    }))
    saveCurrentProject(get())
  },
  removeSentence: (id) => {
    set((state) => ({
      sentences: state.sentences.filter((s) => s.id !== id),
    }))
    saveCurrentProject(get())
  },
  switchAudioVersion: (id, historyIndex) => {
    set((state) => ({
      sentences: state.sentences.map((s) => {
        if (s.id !== id) return s
        const version = s.audioHistory[historyIndex]
        if (!version) return s
        return { ...s, audioPath: version.audioPath, duration: null }
      }),
    }))
    saveCurrentProject(get())
  },
  loadProject: (project) => {
    const state = get()
    // 先保存当前项目
    saveCurrentProject(state)
    // 加载目标项目
    const data = loadProjectData(project)
    set({
      currentProject: project,
      mode: data.mode,
      model: data.model,
      voice: data.voice,
      voiceDesignPrompt: data.voiceDesignPrompt,
      voiceClonePath: data.voiceClonePath,
      sentences: data.sentences,
    })
  },
}))

/** 辅助函数：保存当前项目的完整数据 */
function saveCurrentProject(state: ProjectState): void {
  saveProjectData(state.currentProject, {
    mode: state.mode,
    model: state.model,
    voice: state.voice,
    voiceDesignPrompt: state.voiceDesignPrompt,
    voiceClonePath: state.voiceClonePath,
    sentences: state.sentences,
  })
}
