import type { ApiConfig } from "@/types/api-config"
import type { Project, ProjectVoiceConfigs } from "@/types/project"
import type { Sentence } from "@/types/sentence"
import type { TtsMode } from "@/types/tts"
import { PROVIDERS, resolveConfigVoice } from "./provider-catalog.ts"

export const PROJECT_STORAGE_PREFIX = "dw-project:"
export const DEFAULT_PROJECT_KEY = "__default__"
export const LEGACY_PROJECT_KEY = "dw-project"

export function projectStorageKey(project: string | null): string {
  return `${PROJECT_STORAGE_PREFIX}${project ?? DEFAULT_PROJECT_KEY}`
}

export function getDefaultVoice(apiConfigId: string | null, apiConfigs: ApiConfig[]): string {
  if (apiConfigId) {
    const config = apiConfigs.find((item) => item.id === apiConfigId)
    if (config) {
      if (config.voices.length > 0) return config.voices[0].id
      return PROVIDERS[config.provider].defaultVoices[0]?.id ?? ""
    }
  }
  return PROVIDERS.mimo.defaultVoices[0]?.id ?? ""
}

export function resolveVoiceForApiConfig(
  apiConfigId: string | null,
  currentVoice: string,
  apiConfigs: ApiConfig[],
): string {
  if (!apiConfigId) return currentVoice
  const config = apiConfigs.find((item) => item.id === apiConfigId)
  if (!config) return currentVoice
  return resolveConfigVoice(config, currentVoice)
}

export function createDefaultVoiceConfigs(defaultVoice = ""): ProjectVoiceConfigs {
  return {
    basic: {
      mode: "basic",
      voice: defaultVoice,
      performancePrompt: "",
    },
    "voice-design": {
      mode: "voice-design",
      presetId: null,
      prompt: "",
    },
    "voice-clone": {
      mode: "voice-clone",
      sampleId: null,
      samplePath: null,
      performancePrompt: "",
    },
  }
}

export function createDefaultProject(
  defaultApiConfigId: string | null = null,
  apiConfigs: ApiConfig[] = [],
): Project {
  const defaultVoice = getDefaultVoice(defaultApiConfigId, apiConfigs)
  return {
    apiConfigId: defaultApiConfigId,
    mode: "basic",
    voiceConfigs: createDefaultVoiceConfigs(defaultVoice),
    sentences: [],
  }
}

/** 重置瞬态状态：generating/queued → 根据 audioPath 判断 */
export function normalizeSentences(sentences: unknown, legacyStyleInstruction = ""): Sentence[] {
  if (!Array.isArray(sentences)) return []
  return sentences
    .filter((s): s is Sentence => Boolean(s && typeof s === "object" && typeof s.id === "string"))
    .map((s) => {
      const audioHistory = Array.isArray(s.audioHistory) ? s.audioHistory : []
      const styleInstruction =
        typeof s.styleInstruction === "string" ? s.styleInstruction : legacyStyleInstruction
      if (s.status === "generating" || s.status === "queued") {
        return {
          ...s,
          audioHistory,
          styleInstruction,
          status: s.audioPath ? "completed" : "pending",
        }
      }
      return {
        ...s,
        audioHistory,
        styleInstruction,
      }
    })
}

export function decodePersistedProject(
  rawJson: string | null,
  defaultApiConfigId: string | null,
  apiConfigs: ApiConfig[],
): Project {
  const defaultProject = createDefaultProject(defaultApiConfigId, apiConfigs)
  if (!rawJson) return defaultProject

  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>
    const state =
      parsed &&
      typeof parsed === "object" &&
      "state" in parsed &&
      parsed.state &&
      typeof parsed.state === "object"
        ? (parsed.state as Record<string, unknown>)
        : parsed

    if (!state || typeof state !== "object") return defaultProject

    const apiConfigId =
      typeof state.apiConfigId === "string"
        ? state.apiConfigId
        : state.apiConfigId === null
          ? null
          : defaultApiConfigId

    const mode: TtsMode =
      state.mode === "voice-design" || state.mode === "voice-clone" ? state.mode : "basic"

    // 如果已经是新的 voiceConfigs 结构
    if (state.voiceConfigs && typeof state.voiceConfigs === "object") {
      const rawConfigs = state.voiceConfigs as Record<string, Record<string, unknown>>
      const defaultVoice = getDefaultVoice(apiConfigId, apiConfigs)
      const baseBasic = rawConfigs.basic ?? {}
      const baseDesign = rawConfigs["voice-design"] ?? {}
      const baseClone = rawConfigs["voice-clone"] ?? {}

      const storedBasicVoice = typeof baseBasic.voice === "string" ? baseBasic.voice : defaultVoice
      const voice = resolveVoiceForApiConfig(apiConfigId, storedBasicVoice, apiConfigs)
      const legacyStyleInstruction =
        typeof baseBasic.performancePrompt === "string" ? baseBasic.performancePrompt : ""

      const voiceConfigs: ProjectVoiceConfigs = {
        basic: {
          mode: "basic",
          voice,
          performancePrompt: legacyStyleInstruction,
        },
        "voice-design": {
          mode: "voice-design",
          presetId: typeof baseDesign.presetId === "string" ? baseDesign.presetId : null,
          prompt: typeof baseDesign.prompt === "string" ? baseDesign.prompt : "",
        },
        "voice-clone": {
          mode: "voice-clone",
          sampleId: typeof baseClone.sampleId === "string" ? baseClone.sampleId : null,
          samplePath: typeof baseClone.samplePath === "string" ? baseClone.samplePath : null,
          performancePrompt:
            typeof baseClone.performancePrompt === "string" ? baseClone.performancePrompt : "",
        },
      }

      return {
        apiConfigId,
        mode,
        voiceConfigs,
        sentences: normalizeSentences(state.sentences, legacyStyleInstruction),
      }
    }

    // 旧版平铺字段结构迁移
    const storedVoice =
      typeof state.voice === "string" ? state.voice : getDefaultVoice(apiConfigId, apiConfigs)
    const voice = resolveVoiceForApiConfig(apiConfigId, storedVoice, apiConfigs)

    const voiceDesignId = typeof state.voiceDesignId === "string" ? state.voiceDesignId : null
    const voiceDesignPrompt =
      typeof state.voiceDesignPrompt === "string" ? state.voiceDesignPrompt : ""
    const voiceCloneSampleId =
      typeof state.voiceCloneSampleId === "string" ? state.voiceCloneSampleId : null
    const voiceClonePath = typeof state.voiceClonePath === "string" ? state.voiceClonePath : null
    const performancePrompt =
      typeof state.performancePrompt === "string" ? state.performancePrompt : ""

    const voiceConfigs: ProjectVoiceConfigs = {
      basic: {
        mode: "basic",
        voice,
        // The legacy flat field was shared by Basic and Voice Clone modes.
        // Keep it in both destinations so migration does not discard it when
        // the saved mode was Voice Design or when the user switches modes later.
        performancePrompt,
      },
      "voice-design": {
        mode: "voice-design",
        presetId: voiceDesignId,
        prompt: voiceDesignPrompt,
      },
      "voice-clone": {
        mode: "voice-clone",
        sampleId: voiceCloneSampleId,
        samplePath: voiceClonePath,
        performancePrompt,
      },
    }

    return {
      apiConfigId,
      mode,
      voiceConfigs,
      sentences: normalizeSentences(state.sentences, performancePrompt),
    }
  } catch {
    return defaultProject
  }
}

export function loadProjectFromStorage(
  project: string | null,
  defaultApiConfigId: string | null,
  apiConfigs: ApiConfig[],
): Project {
  const defaultProject = createDefaultProject(defaultApiConfigId, apiConfigs)
  if (typeof localStorage === "undefined") {
    return defaultProject
  }

  try {
    const key = projectStorageKey(project)
    let raw = localStorage.getItem(key)

    // 迁移旧版键名
    if (!raw && project === null) {
      raw = localStorage.getItem(LEGACY_PROJECT_KEY)
      if (raw) {
        localStorage.setItem(key, raw)
        localStorage.removeItem(LEGACY_PROJECT_KEY)
      }
    }

    return decodePersistedProject(raw, defaultApiConfigId, apiConfigs)
  } catch {
    return defaultProject
  }
}

export function saveProjectToStorage(project: string | null, data: Project): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(projectStorageKey(project), JSON.stringify(data))
  } catch {
    // localStorage 满或不可用时静默失败
  }
}
