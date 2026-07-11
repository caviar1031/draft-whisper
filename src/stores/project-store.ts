import { cleanupAudioFiles, invalidateAudioUrl, revokeAllAudioUrls } from "@/services/tts"
import { useSettingsStore } from "@/stores/settings-store"
import type { Project, Sentence, TtsMode } from "@/types"
import { create } from "zustand"

const STORAGE_PREFIX = "dw-project:"
const DEFAULT_KEY = "__default__"
const LEGACY_KEY = "dw-project"

function storageKey(project: string | null): string {
  return `${STORAGE_PREFIX}${project ?? DEFAULT_KEY}`
}

function audioPaths(sentences: Sentence[]): Set<string> {
  const paths = new Set<string>()
  for (const sentence of sentences) {
    if (sentence.audioPath) paths.add(sentence.audioPath)
    for (const version of sentence.audioHistory) paths.add(version.audioPath)
  }
  return paths
}

function deleteUnreferencedAudio(previous: Sentence[], next: Sentence[]): void {
  const retained = audioPaths(next)
  const removed = [...audioPaths(previous)].filter((path) => !retained.has(path))
  if (removed.length > 0) cleanupAudioFiles(removed)
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
  apiConfigId: string | null
  mode: TtsMode
  voice: string
  voiceDesignId: string | null
  voiceDesignPrompt: string
  voiceCloneSampleId: string | null
  voiceClonePath: string | null
  performancePrompt: string
  sentences: Sentence[]
}

const DEFAULT_PROJECT_DATA: ProjectData = {
  apiConfigId: null,
  mode: "basic",
  voice: "冰糖",
  voiceDesignId: null,
  voiceDesignPrompt: "",
  voiceCloneSampleId: null,
  voiceClonePath: null,
  performancePrompt: "",
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

    if (!raw) {
      return {
        ...DEFAULT_PROJECT_DATA,
        apiConfigId: useSettingsStore.getState().defaultApiConfigId,
      }
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // 兼容旧版 Zustand persist 格式 { state: { sentences: [...] } }
    const state = (parsed.state as Record<string, unknown>) ?? parsed
    const sentences = (state.sentences as Sentence[]) ?? []
    const mode = (state.mode as TtsMode) ?? "basic"

    return {
      apiConfigId:
        typeof state.apiConfigId === "string"
          ? state.apiConfigId
          : useSettingsStore.getState().defaultApiConfigId,
      mode,
      voice: (state.voice as string) ?? "冰糖",
      voiceDesignId: (state.voiceDesignId as string | null) ?? null,
      voiceDesignPrompt: (state.voiceDesignPrompt as string) ?? "",
      voiceCloneSampleId: (state.voiceCloneSampleId as string | null) ?? null,
      voiceClonePath: (state.voiceClonePath as string | null) ?? null,
      performancePrompt: (state.performancePrompt as string) ?? "",
      sentences: normalizeSentences(sentences),
    }
  } catch {
    return { ...DEFAULT_PROJECT_DATA, apiConfigId: useSettingsStore.getState().defaultApiConfigId }
  }
}

interface ProjectState extends Project {
  currentProject: string | null
  setApiConfigId: (apiConfigId: string | null) => void
  setMode: (mode: TtsMode) => void
  setVoice: (voice: string) => void
  setVoiceDesignId: (id: string | null) => void
  setVoiceDesignPrompt: (prompt: string) => void
  setVoiceCloneSampleId: (id: string | null) => void
  setVoiceClonePath: (path: string | null) => void
  setPerformancePrompt: (prompt: string) => void
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
  apiConfigId: null,
  mode: "basic",
  voice: "冰糖",
  voiceDesignId: null,
  voiceDesignPrompt: "",
  voiceCloneSampleId: null,
  voiceClonePath: null,
  performancePrompt: "",
  sentences: [],

  setApiConfigId: (apiConfigId) => {
    set({ apiConfigId })
    saveCurrentProject(get())
  },
  setMode: (mode) => {
    set({ mode })
    saveCurrentProject(get())
  },
  setVoice: (voice) => {
    set({ voice })
    saveCurrentProject(get())
  },
  setVoiceDesignId: (voiceDesignId) => {
    set({ voiceDesignId })
    saveCurrentProject(get())
  },
  setVoiceDesignPrompt: (voiceDesignPrompt) => {
    set({ voiceDesignPrompt })
    saveCurrentProject(get())
  },
  setVoiceCloneSampleId: (voiceCloneSampleId) => {
    set({ voiceCloneSampleId })
    saveCurrentProject(get())
  },
  setVoiceClonePath: (voiceClonePath) => {
    set({ voiceClonePath })
    saveCurrentProject(get())
  },
  setPerformancePrompt: (performancePrompt) => {
    set({ performancePrompt })
    saveCurrentProject(get())
  },
  setSentences: (sentences) => {
    deleteUnreferencedAudio(get().sentences, sentences)
    set({ sentences })
    saveCurrentProject(get())
  },
  updateSentence: (id, updates) => {
    set((state) => ({
      sentences: state.sentences.map((s) => (s.id === id ? { ...s, ...updates } : s)),
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
    const sentence = get().sentences.find((s) => s.id === id)
    if (sentence) {
      const paths = [...audioPaths([sentence])]
      for (const path of paths) invalidateAudioUrl(path)
      cleanupAudioFiles(paths)
    }
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
        // 不 invalidate 旧 URL，因为其他版本可能还在用
        return { ...s, audioPath: version.audioPath, duration: null }
      }),
    }))
    saveCurrentProject(get())
  },
  loadProject: (project) => {
    const state = get()
    // 先保存当前项目
    flushAndSave(state)
    // 切换项目时清理所有 Blob URL 缓存
    revokeAllAudioUrls()
    // 加载目标项目
    const data = loadProjectData(project)
    set({
      currentProject: project,
      apiConfigId: data.apiConfigId,
      mode: data.mode,
      voice: data.voice,
      voiceDesignId: data.voiceDesignId,
      voiceDesignPrompt: data.voiceDesignPrompt,
      voiceCloneSampleId: data.voiceCloneSampleId,
      voiceClonePath: data.voiceClonePath,
      performancePrompt: data.performancePrompt,
      sentences: data.sentences,
    })
  },
}))

/** 辅助函数：保存当前项目的完整数据 */
function saveProjectData(project: string | null, data: ProjectData): void {
  try {
    localStorage.setItem(storageKey(project), JSON.stringify(data))
  } catch {
    // localStorage 满或不可用时静默失败
  }
}

/** 保存当前项目（debounced，300ms） */
let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveCurrentProject(state: ProjectState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveProjectData(state.currentProject, {
      apiConfigId: state.apiConfigId,
      mode: state.mode,
      voice: state.voice,
      voiceDesignId: state.voiceDesignId,
      voiceDesignPrompt: state.voiceDesignPrompt,
      voiceCloneSampleId: state.voiceCloneSampleId,
      voiceClonePath: state.voiceClonePath,
      performancePrompt: state.performancePrompt,
      sentences: state.sentences,
    })
  }, 300)
}

/** 立即保存（取消 debounce，用于项目切换等关键场景） */
function flushAndSave(state: ProjectState): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveProjectData(state.currentProject, {
    apiConfigId: state.apiConfigId,
    mode: state.mode,
    voice: state.voice,
    voiceDesignId: state.voiceDesignId,
    voiceDesignPrompt: state.voiceDesignPrompt,
    voiceCloneSampleId: state.voiceCloneSampleId,
    voiceClonePath: state.voiceClonePath,
    performancePrompt: state.performancePrompt,
    sentences: state.sentences,
  })
}

/**
 * 立即保存当前项目（供外部调用，如窗口关闭前）。
 * 取消 debounce 定时器并同步写入 localStorage。
 */
export function flushCurrentProject(): void {
  flushAndSave(useProjectStore.getState())
}

/** 删除某个项目在 localStorage 中的元数据。 */
export function deleteStoredProject(project: string): void {
  localStorage.removeItem(storageKey(project))
}

/** 清除当前项目和所有已保存项目对已删除声音样本的引用。 */
export function clearVoiceSampleReferences(filePath: string): void {
  const current = useProjectStore.getState()
  if (current.voiceClonePath === filePath) current.setVoiceClonePath(null)

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const nestedState = parsed.state as Record<string, unknown> | undefined
      const data = nestedState ?? parsed
      if (data.voiceClonePath !== filePath) continue
      data.voiceClonePath = null
      localStorage.setItem(key, JSON.stringify(parsed))
    } catch {
      // 损坏的旧项目数据由正常加载迁移逻辑处理。
    }
  }
}

export function clearVoiceResourceReferences(
  kind: "design" | "clone",
  resourceId: string,
  fallbackPath?: string,
): void {
  const current = useProjectStore.getState()
  if (kind === "design" && current.voiceDesignId === resourceId) {
    current.setVoiceDesignId(null)
    current.setVoiceDesignPrompt("")
  }
  if (
    kind === "clone" &&
    (current.voiceCloneSampleId === resourceId || current.voiceClonePath === fallbackPath)
  ) {
    current.setVoiceCloneSampleId(null)
    current.setVoiceClonePath(null)
  }

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const data = (parsed.state as Record<string, unknown>) ?? parsed
      if (kind === "design" && data.voiceDesignId === resourceId) {
        data.voiceDesignId = null
        data.voiceDesignPrompt = ""
      }
      if (
        kind === "clone" &&
        (data.voiceCloneSampleId === resourceId || data.voiceClonePath === fallbackPath)
      ) {
        data.voiceCloneSampleId = null
        data.voiceClonePath = null
      }
      localStorage.setItem(key, JSON.stringify(parsed))
    } catch {
      // Ignore damaged legacy entries.
    }
  }
}

export function countApiConfigReferences(configId: string): number {
  let count = 0
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const data = (parsed.state as Record<string, unknown>) ?? parsed
      if (data.apiConfigId === configId) count += 1
    } catch {
      // Ignore damaged legacy entries.
    }
  }
  return count
}

export function reassignApiConfigReferences(
  deletedConfigId: string,
  replacementConfigId: string | null,
): void {
  const current = useProjectStore.getState()
  if (current.apiConfigId === deletedConfigId) current.setApiConfigId(replacementConfigId)

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const data = (parsed.state as Record<string, unknown>) ?? parsed
      if (data.apiConfigId !== deletedConfigId) continue
      data.apiConfigId = replacementConfigId
      localStorage.setItem(key, JSON.stringify(parsed))
    } catch {
      // Ignore damaged legacy entries.
    }
  }
}
