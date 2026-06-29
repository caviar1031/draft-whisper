import { pinyin } from "pinyin-pro"

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/**
 * 生成可读的句子 ID，格式：{序号}_{摘要}_{短ID}
 * 示例：001_JinTianWomenXueXiAgent_k7x9
 *
 * 中文转拼音首字母大写，英文/数字保留原样。
 * 全部为纯 ASCII，与后端 sanitize_filename 字符集一致。
 */
export function generateSentenceId(index: number, text: string): string {
  // 3 位序号，从 001 开始
  const seq = String(index + 1).padStart(3, "0")

  // 中文转拼音首字母，英文数字保留，其他字符忽略
  const raw = pinyin(text, {
    pattern: "first",
    toneType: "none",
    type: "array",
  })
    .join("")
    .replace(/[^a-zA-Z0-9]/g, "")

  // 首字母大写，取前 20 个字符
  const summary = raw.charAt(0).toUpperCase() + raw.slice(1).substring(0, 19)

  // 4 位短 ID，保证唯一性
  const shortId = Math.random().toString(36).substring(2, 6)

  return summary.length > 0 ? `${seq}_${summary}_${shortId}` : `${seq}_${shortId}`
}
