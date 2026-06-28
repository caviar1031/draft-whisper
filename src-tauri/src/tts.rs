use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{ipc::Response, AppHandle, Manager};

/// 与前端 Settings 一一对应的 TTS 调用参数。
///
/// MVP 阶段固定使用 MiMo v2.5 TTS 协议（小米 mimo-v2.5-tts）。
/// - `base_url` 默认 `https://api.xiaomimimo.com/v1`
/// - `model` 默认 `mimo-v2.5-tts`
/// - `voice` 预置音色，如 `冰糖` / `苏打` / `Chloe` / `mimo_default`
/// - `speed` MiMo 无原生 speed 字段；当 speed != 1 时，会以自然语言
///   指令「语速 X 倍」写入 user message 交给模型理解。
///
/// `rename_all = "camelCase"`：前端传 camelCase（baseUrl/apiKey），
/// Rust 内部仍用 snake_case（base_url/api_key）。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsParams {
  pub base_url: String,
  pub api_key: String,
  pub model: String,
  pub voice: String,
  pub speed: f32,
}

/// `tts_generate` 的返回值。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
  pub audio_path: String,
}

/// 规范化 base_url 为 MiMo 的 `/v1/chat/completions` 端点。
/// - 去掉尾部 `/`
/// - 若已以 `/chat/completions` 结尾 → 直接用
/// - 若以 `/v1` 结尾 → 补 `/chat/completions`
/// - 否则 → 补 `/v1/chat/completions`
fn build_chat_endpoint(base_url: &str) -> String {
  let url = base_url.trim_end_matches('/');
  if url.ends_with("/chat/completions") {
    url.to_string()
  } else if url.ends_with("/v1") {
    format!("{url}/chat/completions")
  } else {
    format!("{url}/v1/chat/completions")
  }
}

/// 返回音频缓存目录，不存在则创建。
///
/// 尝试顺序：`app_cache_dir` → `app_data_dir` → 项目本地 `.cache/audio`。
/// macOS sandbox 下前两个可能被 TCC 拒绝写入，最后用项目本地目录兜底。
fn ensure_audio_dir(app: &AppHandle) -> Result<PathBuf, String> {
  // 候选目录：cache_dir, data_dir
  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(p) = app.path().app_cache_dir() {
    candidates.push(p.join("audio"));
    log::info!("candidate app_cache_dir = {}", p.display());
  }
  if let Ok(p) = app.path().app_data_dir() {
    candidates.push(p.join("audio"));
    log::info!("candidate app_data_dir = {}", p.display());
  }

  for dir in &candidates {
    log::info!("尝试目录: {}", dir.display());
    if let Err(e) = std::fs::create_dir_all(dir) {
      log::warn!("create_dir_all 失败 {dir:?}: {e}");
      continue;
    }
    // 验证可写
    let probe = dir.join("._wprobe");
    match std::fs::write(&probe, b"") {
      Ok(()) => {
        let _ = std::fs::remove_file(&probe);
        log::info!("✓ 使用目录: {}", dir.display());
        return Ok(dir.clone());
      }
      Err(e) => {
        log::warn!("写探测失败 {dir:?}: {e}");
        let _ = std::fs::remove_file(&probe);
      }
    }
  }

  // 最终 fallback：项目本地 .cache/audio（dev 模式可写）
  let local = std::env::current_dir()
    .map_err(|e| format!("获取 cwd 失败: {e}"))?
    .join(".cache")
    .join("audio");
  log::info!("fallback 本地目录: {}", local.display());
  std::fs::create_dir_all(&local)
    .map_err(|e| format!("所有目录都不可写，连本地 fallback 也失败: {local:?} -> {e}"))?;
  Ok(local)
}

/// 把任意字符串转成安全的文件名（仅保留字母数字、`-`、`_`）。
fn sanitize_filename(name: &str) -> String {
  name
    .chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else {
        '_'
      }
    })
    .collect()
}

/// 发起一次 MiMo v2.5 TTS 请求，返回 wav 音频字节。
///
/// 协议：POST {base}/chat/completions
/// - Header: `api-key: {apiKey}`
/// - Body: `{ model, messages:[{role:user,content:指令?},{role:assistant,content:text}], audio:{format:"wav", voice} }`
/// - Response: JSON，音频在 `choices[0].message.audio.data`（base64）
async fn request_speech(params: &TtsParams, text: &str) -> Result<Vec<u8>, String> {
  let endpoint = build_chat_endpoint(&params.base_url);

  // messages：assistant 放目标文本（必填）；speed != 1 时追加 user 自然语言指令
  let mut messages = Vec::<Value>::with_capacity(2);
  if (params.speed - 1.0).abs() > 0.01 {
    messages.push(serde_json::json!({
      "role": "user",
      "content": format!("语速 {} 倍", params.speed),
    }));
  }
  messages.push(serde_json::json!({
    "role": "assistant",
    "content": text,
  }));

  let body = serde_json::json!({
    "model": params.model,
    "messages": messages,
    "audio": {
      "format": "wav",
      "voice": params.voice,
    }
  });

  let client = reqwest::Client::new();
  let resp = client
    .post(&endpoint)
    .header("api-key", &params.api_key)
    .header("Content-Type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("请求失败: {e}"))?;

  let status = resp.status();
  if !status.is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(format!("HTTP {status}: {text}"));
  }

  // MiMo 返回 JSON，音频在 choices[0].message.audio.data（base64）
  let json: Value = resp
    .json()
    .await
    .map_err(|e| format!("解析响应 JSON 失败: {e}"))?;

  let audio_data = json
    .get("choices")
    .and_then(|c| c.get(0))
    .and_then(|c| c.get("message"))
    .and_then(|m| m.get("audio"))
    .and_then(|a| a.get("data"))
    .and_then(|d| d.as_str())
    .ok_or_else(|| {
      format!("响应中缺少 choices[0].message.audio.data: {}", json)
    })?;

  STANDARD
    .decode(audio_data)
    .map_err(|e| format!("base64 解码失败: {e}"))
}

/// 为某一句文本生成音频并写入本地缓存（同名覆盖）。
///
/// 前端调用: `invoke("tts_generate", { sentenceId, text, params })`
#[tauri::command]
pub async fn tts_generate(
  sentence_id: String,
  text: String,
  params: TtsParams,
  app: AppHandle,
) -> Result<TtsResult, String> {
  if text.trim().is_empty() {
    return Err("文本为空".into());
  }
  if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
    return Err("缺少 baseUrl 或 apiKey，请先在设置中填写".into());
  }

  let audio_dir = ensure_audio_dir(&app)?;
  let file_name = format!("{}.wav", sanitize_filename(&sentence_id));
  let file_path = audio_dir.join(file_name);

  let bytes = request_speech(&params, &text).await?;

  std::fs::write(&file_path, &bytes)
    .map_err(|e| format!("写入音频文件失败: {file_path:?} -> {e}"))?;

  Ok(TtsResult {
    audio_path: file_path.to_string_lossy().to_string(),
  })
}

/// 用一段极短测试文本发起一次真实请求，验证 settings 是否可用。
///
/// 前端调用: `invoke("tts_test", { params })`
#[tauri::command]
pub async fn tts_test(params: TtsParams) -> Result<(), String> {
  if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
    return Err("缺少 baseUrl 或 apiKey".into());
  }
  request_speech(&params, "测试").await?;
  Ok(())
}

/// 读取本地音频文件字节，供前端转 Blob URL 播放。
///
/// 前端调用: `invoke("tts_read_audio", { path })` → ArrayBuffer
#[tauri::command]
pub fn tts_read_audio(path: String) -> Result<Response, String> {
  let bytes = std::fs::read(&path).map_err(|e| format!("读取音频文件失败: {e}"))?;
  Ok(Response::new(bytes))
}
