export type SentenceStatus = "pending" | "generating" | "completed" | "failed"

export interface Sentence {
  id: string
  text: string
  status: SentenceStatus
  audioPath: string | null
  duration: number | null
}
