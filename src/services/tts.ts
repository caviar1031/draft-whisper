import type { Settings } from "@/types"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"

/** TTS 调用参数，与 Settings 字段一一对应，传给 Rust 后端。 */
export type TtsParams = Settings

/** `tts_generate` 的返回值。 */
export interface TtsResult {
  audioPath: string
}

// ---- Blob URL 缓存 ----------------------------------------------------
// 同一句重新生成会用相同路径覆盖文件，缓存中对应 URL 即失效。
// generateSentenceAudio 成功后会自动 invalidate 该路径，确保下次读取拿到新字节。
const audioUrlCache = new Map<string, string>()

/** 释放某个路径对应的 Blob URL（若已缓存）。 */
export function invalidateAudioUrl(path: string | null | undefined): void {
  if (!path) return
  const url = audioUrlCache.get(path)
  if (url) {
    URL.revokeObjectURL(url)
    audioUrlCache.delete(path)
  }
}

/** 释放所有缓存的 Blob URL（项目切换/退出时调用）。 */
export function revokeAllAudioUrls(): void {
  for (const url of audioUrlCache.values()) URL.revokeObjectURL(url)
  audioUrlCache.clear()
}

// ---- Tauri command 封装 ------------------------------------------------

/**
 * 为某一句文本生成音频并缓存到本地。
 * 成功后自动 invalidate 该路径的旧 Blob URL（重新生成场景）。
 *
 * 后端: invoke("tts_generate", { sentenceId, text, params, outputDir })
 */
export async function generateSentenceAudio(
  sentenceId: string,
  text: string,
  params: TtsParams,
  outputDir?: string | null,
): Promise<TtsResult> {
  const result = await invoke<TtsResult>("tts_generate", { sentenceId, text, params, outputDir })
  invalidateAudioUrl(result.audioPath)
  return result
}

/**
 * 测试当前 settings 是否可用（设置页「Test API」按钮）。
 *
 * 后端: invoke("tts_test", { params })
 */
export async function testTts(params: TtsParams): Promise<void> {
  await invoke<void>("tts_test", { params })
}

/**
 * 获取可用模型列表。
 *
 * 后端: invoke("tts_list_models", { baseUrl, apiKey }) → string[]
 */
export async function listModels(baseUrl: string, apiKey: string): Promise<string[]> {
  return invoke<string[]>("tts_list_models", { baseUrl, apiKey })
}

/**
 * 弹出系统目录选择对话框，返回选中的目录路径。
 * 用户取消时返回 `null`。
 *
 * 后端: `@tauri-apps/plugin-dialog` 的 `open` 方法
 */
export async function pickDir(): Promise<string | null> {
  const result = await open({
    directory: true,
    multiple: false,
  })
  if (!result) return null
  if (Array.isArray(result)) return result[0] ?? null
  return result
}

/**
 * 读取本地音频文件字节并转为可播放的 Blob URL（带缓存）。
 * 直接给 <audio src={url}> 使用即可。
 *
 * 后端: invoke("tts_read_audio", { path }) -> ArrayBuffer
 */
export async function readAudioAsUrl(path: string): Promise<string> {
  const cached = audioUrlCache.get(path)
  if (cached) return cached

  const bytes = await invoke<ArrayBuffer>("tts_read_audio", { path })
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
  audioUrlCache.set(path, url)
  return url
}

/**
 * 将音频文件复制到 macOS 系统剪贴板（文件引用）。
 * 用户随后可以在 Finder / 剪映 / Premiere 等应用中 Cmd+V 粘贴文件。
 *
 * 后端: invoke("tts_copy_to_clipboard", { path })
 */
export async function copyAudioToClipboard(path: string): Promise<void> {
  await invoke<void>("tts_copy_to_clipboard", { path })
}

/**
 * 在 Finder 中显示音频文件。
 *
 * 后端: invoke("tts_show_in_finder", { path })
 */
export async function showInFinder(path: string): Promise<void> {
  await invoke<void>("tts_show_in_finder", { path })
}

/**
 * 发起 macOS 原生文件拖拽（将音频文件拖入剪映/Premiere 等剪辑软件）。
 *
 * 后端: invoke("tts_drag_file", { path, window })
 */
export async function nativeDragFile(path: string): Promise<void> {
  await invoke<void>("tts_drag_file", { path })
}
