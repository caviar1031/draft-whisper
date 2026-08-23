import { cleanupAudioFiles, invalidateAudioUrl, revokeAllAudioUrls } from "@/services/audio"
import { useSettingsStore } from "@/stores/settings-store"
import type { Project } from "@/types/project"
import type { Sentence } from "@/types/sentence"
import type { AudioFormat, TtsMode } from "@/types/tts"
import {
  PROJECT_STORAGE_PREFIX,
  createDefaultProject,
  decodePersistedProject,
  loadProjectFromStorage,
  projectStorageKey,
  resolveVoiceForApiConfig,
  saveProjectToStorage,
} from "@/utils/project-persistence"
import { resolveAudioFormat } from "@/utils/provider-catalog"
import { create } from "zustand"

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

export interface ProjectState extends Project {
  currentProject: string | null
  setApiConfigId: (apiConfigId: string | null) => void
  setMode: (mode: TtsMode) => void
  setOutputFormat: (format: AudioFormat) => void
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

const initialDefault = createDefaultProject()

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  apiConfigId: initialDefault.apiConfigId,
  mode: initialDefault.mode,
  outputFormat: initialDefault.outputFormat,
  voiceConfigs: initialDefault.voiceConfigs,
  sentences: initialDefault.sentences,

  setApiConfigId: (apiConfigId) => {
    const apiConfigs = useSettingsStore.getState().apiConfigs
    set((state) => ({
      apiConfigId,
      outputFormat: resolveAudioFormat(
        apiConfigs.find((config) => config.id === apiConfigId),
        state.mode,
        state.outputFormat,
      ),
      voiceConfigs: {
        ...state.voiceConfigs,
        basic: {
          ...state.voiceConfigs.basic,
          voice: resolveVoiceForApiConfig(apiConfigId, state.voiceConfigs.basic.voice, apiConfigs),
        },
      },
    }))
    saveCurrentProject(get())
  },
  setMode: (mode) => {
    const apiConfigs = useSettingsStore.getState().apiConfigs
    set((state) => ({
      mode,
      outputFormat: resolveAudioFormat(
        apiConfigs.find((config) => config.id === state.apiConfigId),
        mode,
        state.outputFormat,
      ),
    }))
    saveCurrentProject(get())
  },
  setOutputFormat: (outputFormat) => {
    set({ outputFormat })
    saveCurrentProject(get())
  },
  setVoice: (voice) => {
    set((state) => ({
      voiceConfigs: {
        ...state.voiceConfigs,
        basic: {
          ...state.voiceConfigs.basic,
          voice,
        },
      },
    }))
    saveCurrentProject(get())
  },
  setVoiceDesignId: (presetId) => {
    set((state) => ({
      voiceConfigs: {
        ...state.voiceConfigs,
        "voice-design": {
          ...state.voiceConfigs["voice-design"],
          presetId,
        },
      },
    }))
    saveCurrentProject(get())
  },
  setVoiceDesignPrompt: (prompt) => {
    set((state) => ({
      voiceConfigs: {
        ...state.voiceConfigs,
        "voice-design": {
          ...state.voiceConfigs["voice-design"],
          prompt,
        },
      },
    }))
    saveCurrentProject(get())
  },
  setVoiceCloneSampleId: (sampleId) => {
    set((state) => ({
      voiceConfigs: {
        ...state.voiceConfigs,
        "voice-clone": {
          ...state.voiceConfigs["voice-clone"],
          sampleId,
        },
      },
    }))
    saveCurrentProject(get())
  },
  setVoiceClonePath: (samplePath) => {
    set((state) => ({
      voiceConfigs: {
        ...state.voiceConfigs,
        "voice-clone": {
          ...state.voiceConfigs["voice-clone"],
          samplePath,
        },
      },
    }))
    saveCurrentProject(get())
  },
  setPerformancePrompt: (prompt) => {
    set((state) => {
      const mode = state.mode
      if (mode === "voice-design") return state
      if (mode === "voice-clone") {
        return {
          voiceConfigs: {
            ...state.voiceConfigs,
            "voice-clone": {
              ...state.voiceConfigs["voice-clone"],
              performancePrompt: prompt,
            },
          },
        }
      }
      return {
        voiceConfigs: {
          ...state.voiceConfigs,
          basic: {
            ...state.voiceConfigs.basic,
            performancePrompt: prompt,
          },
        },
      }
    })
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
    const { defaultApiConfigId, apiConfigs } = useSettingsStore.getState()
    const data = loadProjectFromStorage(project, defaultApiConfigId, apiConfigs)
    set({
      currentProject: project,
      apiConfigId: data.apiConfigId,
      mode: data.mode,
      outputFormat: data.outputFormat,
      voiceConfigs: data.voiceConfigs,
      sentences: data.sentences,
    })
  },
}))

function projectToSave(state: ProjectState): Project {
  return {
    apiConfigId: state.apiConfigId,
    mode: state.mode,
    outputFormat: state.outputFormat,
    voiceConfigs: state.voiceConfigs,
    sentences: state.sentences,
  }
}

/** 保存当前项目（debounced，300ms） */
let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveCurrentProject(state: ProjectState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveProjectToStorage(state.currentProject, projectToSave(state))
  }, 300)
}

/** 立即保存（取消 debounce，用于项目切换等关键场景） */
function flushAndSave(state: ProjectState): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveProjectToStorage(state.currentProject, projectToSave(state))
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
  if (typeof localStorage === "undefined") return
  localStorage.removeItem(projectStorageKey(project))
}

/** 清除当前项目和所有已保存项目对已删除声音样本的引用。 */
export function clearVoiceSampleReferences(filePath: string): void {
  const current = useProjectStore.getState()
  if (current.voiceConfigs["voice-clone"].samplePath === filePath) {
    current.setVoiceClonePath(null)
  }

  if (typeof localStorage === "undefined") return
  const { defaultApiConfigId, apiConfigs } = useSettingsStore.getState()

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(PROJECT_STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const decoded = decodePersistedProject(raw, defaultApiConfigId, apiConfigs)
      if (decoded.voiceConfigs["voice-clone"].samplePath === filePath) {
        decoded.voiceConfigs["voice-clone"].samplePath = null
        localStorage.setItem(key, JSON.stringify(decoded))
      }
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
  if (kind === "design" && current.voiceConfigs["voice-design"].presetId === resourceId) {
    current.setVoiceDesignId(null)
    current.setVoiceDesignPrompt("")
  }
  if (
    kind === "clone" &&
    (current.voiceConfigs["voice-clone"].sampleId === resourceId ||
      current.voiceConfigs["voice-clone"].samplePath === fallbackPath)
  ) {
    current.setVoiceCloneSampleId(null)
    current.setVoiceClonePath(null)
  }

  if (typeof localStorage === "undefined") return
  const { defaultApiConfigId, apiConfigs } = useSettingsStore.getState()

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(PROJECT_STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const decoded = decodePersistedProject(raw, defaultApiConfigId, apiConfigs)
      let changed = false
      if (kind === "design" && decoded.voiceConfigs["voice-design"].presetId === resourceId) {
        decoded.voiceConfigs["voice-design"].presetId = null
        decoded.voiceConfigs["voice-design"].prompt = ""
        changed = true
      }
      if (
        kind === "clone" &&
        (decoded.voiceConfigs["voice-clone"].sampleId === resourceId ||
          decoded.voiceConfigs["voice-clone"].samplePath === fallbackPath)
      ) {
        decoded.voiceConfigs["voice-clone"].sampleId = null
        decoded.voiceConfigs["voice-clone"].samplePath = null
        changed = true
      }
      if (changed) {
        localStorage.setItem(key, JSON.stringify(decoded))
      }
    } catch {
      // Ignore damaged legacy entries.
    }
  }
}

export function countApiConfigReferences(configId: string): number {
  if (typeof localStorage === "undefined") return 0
  let count = 0
  const { defaultApiConfigId, apiConfigs } = useSettingsStore.getState()

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(PROJECT_STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const decoded = decodePersistedProject(raw, defaultApiConfigId, apiConfigs)
      if (decoded.apiConfigId === configId) count += 1
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

  if (typeof localStorage === "undefined") return
  const { defaultApiConfigId, apiConfigs } = useSettingsStore.getState()

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(PROJECT_STORAGE_PREFIX)) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const decoded = decodePersistedProject(raw, defaultApiConfigId, apiConfigs)
      if (decoded.apiConfigId !== deletedConfigId) continue
      decoded.apiConfigId = replacementConfigId
      decoded.voiceConfigs.basic.voice = resolveVoiceForApiConfig(
        replacementConfigId,
        decoded.voiceConfigs.basic.voice,
        apiConfigs,
      )
      localStorage.setItem(key, JSON.stringify(decoded))
    } catch {
      // Ignore damaged legacy entries.
    }
  }
}
