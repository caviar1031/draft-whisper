import type { TtsParams, TtsResult } from "@/types/tts"
import { invoke } from "@tauri-apps/api/core"
import { invalidateAudioUrl } from "./audio"

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

/** 生成独立的声音克隆试听文件，不写入项目句子历史。 */
export async function previewVoiceClone(text: string, params: TtsParams): Promise<TtsResult> {
  return invoke<TtsResult>("tts_preview_voice_clone", { text, params })
}

/** 生成基础音色或声音设计试听文件。 */
export async function previewVoice(text: string, params: TtsParams): Promise<TtsResult> {
  return invoke<TtsResult>("tts_preview_voice", { text, params })
}

/**
 * 测试当前 settings 是否可用（设置页「测试语音生成」按钮）。
 *
 * 后端: invoke("tts_test", { params })
 */
export async function testTts(params: TtsParams): Promise<void> {
  await invoke<void>("tts_test", { params })
}
