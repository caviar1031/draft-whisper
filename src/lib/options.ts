// 语音、速度、模型可选项 — 与 Settings Popover 设计稿保持一致

export interface VoiceOption {
  value: string
  label: string
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { value: "alloy", label: "Alloy" },
  { value: "echo", label: "Echo" },
  { value: "fable", label: "Fable" },
  { value: "onyx", label: "Onyx" },
  { value: "nova", label: "Nova" },
  { value: "shimmer", label: "Shimmer" },
]

export const SPEED_OPTIONS: number[] = [0.5, 0.75, 1, 1.25, 1.5, 2]

export const MODEL_OPTIONS: string[] = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]

export function formatSpeed(speed: number): string {
  return `${speed.toFixed(speed < 1 ? 2 : 1)}x`
}

export function voiceLabel(value: string): string {
  return VOICE_OPTIONS.find((v) => v.value === value)?.label ?? value
}
