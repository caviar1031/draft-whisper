import type { SavedVoiceSample } from "@/types/voice-resource"
import { invoke } from "@tauri-apps/api/core"

// ---- Blob URL 缓存 ----------------------------------------------------
// 同一句重新生成会用相同路径覆盖文件，缓存中对应 URL 即失效。
// generateSentenceAudio 成功后会自动 invalidate 该路径，确保下次读取拿到新字节。
const audioUrlCache = new Map<string, string>()
const audioUrlRequests = new Map<string, Promise<string>>()

export function getAudioMimeType(path: string): "audio/mpeg" | "audio/wav" {
  return path.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav"
}

/** 同步读取已经准备好的 Blob URL，播放按钮可用它保持用户手势链。 */
export function getCachedAudioUrl(path: string): string | null {
  return audioUrlCache.get(path) ?? null
}

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

  const existingRequest = audioUrlRequests.get(path)
  if (existingRequest) return existingRequest

  const request = invoke<string>("tts_read_audio", { path })
    .then((base64) => {
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: getAudioMimeType(path) }))
      audioUrlCache.set(path, url)
      return url
    })
    .finally(() => {
      if (audioUrlRequests.get(path) === request) audioUrlRequests.delete(path)
    })
  audioUrlRequests.set(path, request)
  return request
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
 * 将音频文件复制到 macOS / Windows 系统剪贴板（文件引用）。
 * 用户随后可以在 Finder、文件资源管理器或剪辑软件中粘贴文件。
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
 * 发起 macOS / Windows 原生文件拖拽（将音频文件拖入剪映/Premiere 等剪辑软件）。
 *
 * 后端: invoke("tts_drag_file", { path, window })
 */
export async function nativeDragFile(path: string): Promise<void> {
  await invoke<void>("tts_drag_file", { path })
}

/**
 * 校验外部 WAV/MP3 并复制到音色样本库，返回路径、格式和大小元数据。
 *
 * 后端: invoke("save_voice_sample", { sourcePath, sampleId }) → SavedVoiceSample
 */
export async function saveVoiceSample(
  sourcePath: string,
  sampleId: string,
): Promise<SavedVoiceSample> {
  return invoke<SavedVoiceSample>("save_voice_sample", { sourcePath, sampleId })
}

/**
 * 删除音色样本文件。
 *
 * 后端: invoke("delete_voice_sample", { path })
 */
export async function deleteVoiceSample(path: string): Promise<void> {
  await invoke<void>("delete_voice_sample", { path })
  invalidateAudioUrl(path)
}
