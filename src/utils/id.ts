export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/**
 * 生成可读的句子 ID，格式：{序号}_{文本摘要}_{短ID}
 * 示例：001_今天我们学习Agent_k7x9
 */
export function generateSentenceId(index: number, text: string): string {
  // 3 位序号，从 001 开始
  const seq = String(index + 1).padStart(3, "0")

  // 文本摘要：取前 20 个字符，清理特殊字符
  const cleaned = text
    .replace(/[。！？；.!?\n\r]/g, "") // 移除句末标点
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "") // 只保留中文、英文、数字
    .substring(0, 20)

  // 4 位短 ID，保证唯一性
  const shortId = Math.random().toString(36).substring(2, 6)

  return `${seq}_${cleaned}_${shortId}`
}
