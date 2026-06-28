import type { Sentence } from "@/types"
import { generateId } from "./id"

export function splitTextToSentences(text: string): Sentence[] {
  // 匹配一段非分隔符文本 + 可选的分隔符（中英文句末标点），保留原标点
  const pattern = /[^。！？；.!?\n]+[。！？；.!?]*/g
  const matches = text.match(pattern) ?? []

  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((sentenceText) => ({
      id: generateId(),
      text: sentenceText,
      status: "pending" as const,
      audioPath: null,
      duration: null,
    }))
}
