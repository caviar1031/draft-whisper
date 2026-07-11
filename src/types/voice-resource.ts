export interface VoiceDesignPreset {
  id: string
  name: string
  prompt: string
  previewAudioPath: string | null
  previewText: string
  previewApiConfigId: string | null
  lastVerifiedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface VoiceCloneSample {
  id: string
  name: string
  filePath: string
  createdAt: number
  format: "wav" | "mp3"
  mimeType: "audio/wav" | "audio/mpeg"
  byteSize: number
  encodedSize: number
  durationMs: number | null
  source: "uploaded" | "voice-design"
  designPrompt?: string
}
