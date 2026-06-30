export type SentenceStatus = "pending" | "queued" | "generating" | "completed" | "failed"

/** 单次生成的音频版本记录 */
export interface AudioVersion {
  audioPath: string
  createdAt: number
}

export interface Sentence {
  id: string
  text: string
  status: SentenceStatus
  audioPath: string | null
  audioHistory: AudioVersion[]
  duration: number | null
}
