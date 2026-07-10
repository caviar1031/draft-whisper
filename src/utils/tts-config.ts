import type { TtsMode } from "@/types"

export const MODEL_BY_MODE: Record<TtsMode, string> = {
  basic: "mimo-v2.5-tts",
  "voice-design": "mimo-v2.5-tts-voicedesign",
  "voice-clone": "mimo-v2.5-tts-voiceclone",
}

interface TtsConfiguration {
  mode: TtsMode
  model: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
}

export function getTtsConfigurationError(config: TtsConfiguration): string | null {
  const expectedModel = MODEL_BY_MODE[config.mode]
  if (config.model !== expectedModel) {
    return `当前模式需要模型 ${expectedModel}`
  }
  if (config.mode === "voice-design" && !config.voiceDesignPrompt.trim()) {
    return "请先填写声音设计描述"
  }
  if (config.mode === "voice-clone" && !config.voiceClonePath) {
    return "请先选择 WAV 或 MP3 声音样本"
  }
  return null
}
