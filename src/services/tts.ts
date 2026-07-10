import type { TtsMode } from "@/types"
import { invoke } from "@tauri-apps/api/core"

/** TTS 调用参数，与 Rust TtsParams struct 一一对应。 */
export interface TtsParams {
  baseUrl: string
  apiKey: string
  model: string
  mode: TtsMode
  voice: string
  voiceDesignPrompt: string
  voiceClonePath: string | null
}

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
 * 后端: invoke("tts_generate", { sentenceId, text, params, project })
 */
export async function generateSentenceAudio(
  sentenceId: string,
  text: string,
  params: TtsParams,
  project?: string | null,
): Promise<TtsResult> {
  const result = await invoke<TtsResult>("tts_generate", { sentenceId, text, params, project })
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
 * 列出所有已有项目名称。
 *
 * 后端: invoke("tts_list_projects") → string[]
 */
export async function listProjects(): Promise<string[]> {
  return invoke<string[]>("tts_list_projects")
}

/**
 * 创建新项目，返回创建后的完整项目列表。
 *
 * 后端: invoke("tts_create_project", { name }) → string[]
 */
export async function createProject(name: string): Promise<string[]> {
  return invoke<string[]>("tts_create_project", { name })
}

/** 删除项目目录及其缓存音频，并返回剩余项目列表。 */
export async function deleteProject(name: string): Promise<string[]> {
  return invoke<string[]>("tts_delete_project", { name })
}

/**
 * 读取本地音频文件并转为可播放的 Blob URL（带缓存）。
 * 直接给 <audio src={url}> 使用即可。
 *
 * 后端返回 base64 编码的字符串，前端解码为 ArrayBuffer 再创建 Blob URL。
 * 使用 base64 避免 Tauri v2 IPC 对二进制数据的序列化问题。
 */
export async function readAudioAsUrl(path: string): Promise<string> {
  const cached = audioUrlCache.get(path)
  if (cached) return cached

  const base64 = await invoke<string>("tts_read_audio", { path })
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
  audioUrlCache.set(path, url)
  return url
}

/** 删除不再使用的缓存音频，并释放对应 Blob URL。 */
export async function deleteAudioFiles(paths: string[]): Promise<void> {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (uniquePaths.length === 0) return
  for (const path of uniquePaths) invalidateAudioUrl(path)
  await invoke<void>("tts_delete_audio_files", { paths: uniquePaths })
}

/** 后台执行缓存清理；失败只记录，不影响用户的主要编辑/生成流程。 */
export function cleanupAudioFiles(paths: string[]): void {
  void deleteAudioFiles(paths).catch((error) => console.error("Audio cache cleanup failed:", error))
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

/**
 * 将外部音频文件复制到音色样本库目录，返回存储后的绝对路径。
 *
 * 后端: invoke("save_voice_sample", { sourcePath, sampleId }) → string
 */
export async function saveVoiceSample(sourcePath: string, sampleId: string): Promise<string> {
  return invoke<string>("save_voice_sample", { sourcePath, sampleId })
}

/**
 * 删除音色样本文件。
 *
 * 后端: invoke("delete_voice_sample", { path })
 */
export async function deleteVoiceSample(path: string): Promise<void> {
  await invoke<void>("delete_voice_sample", { path })
}

/**
 * 将 API Key 存入 macOS Keychain。
 *
 * 后端: invoke("save_api_key", { apiKey })
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  await invoke<void>("save_api_key", { apiKey })
}

/**
 * 从 macOS Keychain 读取 API Key。
 *
 * 后端: invoke("load_api_key") → string | null
 */
export async function loadApiKey(): Promise<string | null> {
  return invoke<string | null>("load_api_key")
}

/**
 * 从 macOS Keychain 删除 API Key。
 *
 * 后端: invoke("delete_api_key")
 */
export async function deleteApiKey(): Promise<void> {
  await invoke<void>("delete_api_key")
}
