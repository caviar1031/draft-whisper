// 语音、模型可选项 — MiMo v2.5 TTS

export interface VoiceOption {
  value: string
  label: string
  desc?: string
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { value: "冰糖", label: "冰糖", desc: "女·中" },
  { value: "茉莉", label: "茉莉", desc: "女·中" },
  { value: "苏打", label: "苏打", desc: "男·中" },
  { value: "白桦", label: "白桦", desc: "男·中" },
  { value: "Mia", label: "Mia", desc: "女·英" },
  { value: "Chloe", label: "Chloe", desc: "女·英" },
  { value: "Milo", label: "Milo", desc: "男·英" },
  { value: "Dean", label: "Dean", desc: "男·英" },
  { value: "mimo_default", label: "Default" },
]

export const CONCURRENCY_OPTIONS: number[] = [1, 2, 3, 4, 5]

export const MODEL_OPTIONS: string[] = [
  "mimo-v2.5-tts",
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts-voiceclone",
]

export function voiceLabel(value: string): string {
  return VOICE_OPTIONS.find((v) => v.value === value)?.label ?? value
}
