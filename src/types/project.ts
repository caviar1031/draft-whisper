import type { Sentence } from "./sentence"

export type TtsMode = "basic" | "voice-design" | "voice-clone"

/** 单个模型配置 */
export interface ModelConfig {
  id: string
  name: string
  mode: TtsMode
}

export interface Project {
  mode: TtsMode
  model: string
  voice: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
  sentences: Sentence[]
}

/**
 * 根据模型名自动推断 TTS 模式。
 * - 包含 voicedesign → voice-design
 * - 包含 voiceclone → voice-clone
 * - 其他 → basic
 */
export function inferTtsMode(modelId: string): TtsMode {
  const lower = modelId.toLowerCase()
  if (lower.includes("voicedesign")) return "voice-design"
  if (lower.includes("voiceclone")) return "voice-clone"
  return "basic"
}
