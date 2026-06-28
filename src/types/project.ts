import type { Sentence } from "./sentence"

export interface Project {
  voice: string
  model: string
  speed: number
  sentences: Sentence[]
}
