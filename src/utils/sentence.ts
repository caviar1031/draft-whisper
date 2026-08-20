import type { Sentence } from "@/types/sentence"
import { generateSentenceId } from "./id.ts"

export function splitTextToSentences(text: string): Sentence[] {
  // 匹配一段非分隔符文本 + 可选的分隔符（中英文句末标点），保留原标点
  const pattern = /[^。！？；.!?\n]+[。！？；.!?]*/g
  const matches = text.match(pattern) ?? []

  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((sentenceText, index) => ({
      id: generateSentenceId(index, sentenceText),
      text: sentenceText,
      styleInstruction: "",
      status: "pending" as const,
      audioPath: null,
      audioHistory: [],
      duration: null,
    }))
}
