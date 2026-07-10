use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// 全局共享的 HTTP Client（复用连接池 + 超时配置）。
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client")
    })
}

/// 校验路径是否在音频缓存目录内（防止路径遍历攻击）。
///
/// 会 canonicalize 路径以解析 `..` 等遍历符号。
/// 文件不存在时（如 delete 场景），校验其父目录。
fn is_in_audio_dir(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let audio_dir = ensure_audio_dir(app)?;
    let canonical_dir = audio_dir
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize audio dir: {e}"))?;

    let target = std::path::Path::new(path);
    let canonical_path = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {e}"))?
    } else {
        // File doesn't exist — validate its parent directory instead
        let parent = target.parent().unwrap_or(target);
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Parent directory not found or unresolvable: {e}"))?;
        canonical_parent.join(target.file_name().unwrap_or_default())
    };

    if !canonical_path.starts_with(&canonical_dir) {
        return Err(format!(
            "Path is outside audio directory: {} (allowed: {})",
            path,
            audio_dir.display()
        ));
    }
    Ok(canonical_path)
}

/// TTS 模式枚举。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TtsMode {
    Basic,
    VoiceDesign,
    VoiceClone,
}

/// 与前端 Settings 一一对应的 TTS 调用参数。
///
/// `rename_all = "camelCase"`：前端传 camelCase（baseUrl/apiKey），
/// Rust 内部仍用 snake_case（base_url/api_key）。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsParams {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub mode: TtsMode,
    pub voice: String,
    pub voice_design_prompt: String,
    pub voice_clone_path: Option<String>,
    pub performance_prompt: String,
}

/// `tts_generate` 的返回值。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
  pub audio_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSampleResult {
  pub file_path: String,
  pub format: String,
  pub mime_type: String,
  pub byte_size: u64,
  pub encoded_size: usize,
}

const MAX_VOICE_CLONE_DATA_URI_SIZE: usize = 10 * 1024 * 1024;

fn validate_voice_clone_data_uri_size(size: usize) -> Result<(), String> {
  if size > MAX_VOICE_CLONE_DATA_URI_SIZE {
    return Err(format!(
      "Voice clone sample is too large after Base64 encoding ({:.2} MB); maximum is 10 MB",
      size as f64 / 1024.0 / 1024.0
    ));
  }
  Ok(())
}

fn expected_model(mode: &TtsMode) -> &'static str {
  match mode {
    TtsMode::Basic => "mimo-v2.5-tts",
    TtsMode::VoiceDesign => "mimo-v2.5-tts-voicedesign",
    TtsMode::VoiceClone => "mimo-v2.5-tts-voiceclone",
  }
}

fn validate_tts_params(params: &TtsParams) -> Result<(), String> {
  let expected = expected_model(&params.mode);
  if params.model != expected {
    return Err(format!(
      "Model {} does not match mode {:?}; expected {expected}",
      params.model, params.mode
    ));
  }
  if params.mode == TtsMode::VoiceDesign && params.voice_design_prompt.trim().is_empty() {
    return Err("Voice design description is required".into());
  }
  if params.mode == TtsMode::VoiceClone
    && params
      .voice_clone_path
      .as_deref()
      .unwrap_or_default()
      .trim()
      .is_empty()
  {
    return Err("Select a WAV or MP3 voice sample before generating".into());
  }
  Ok(())
}

fn audio_format(path: &std::path::Path) -> Result<(&'static str, &'static str), String> {
  match path
    .extension()
    .and_then(|extension| extension.to_str())
    .map(str::to_ascii_lowercase)
    .as_deref()
  {
    Some("wav") => Ok(("wav", "audio/wav")),
    Some("mp3") => Ok(("mp3", "audio/mpeg")),
    _ => Err("Voice clone samples must be WAV or MP3 files".into()),
  }
}

fn validate_audio_signature(format: &str, bytes: &[u8]) -> Result<(), String> {
  let valid = match format {
    "wav" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE",
    "mp3" => {
      bytes.starts_with(b"ID3")
        || (bytes.len() >= 2 && bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0)
    }
    _ => false,
  };
  if valid {
    Ok(())
  } else {
    Err(format!(
      "The selected file content does not match its .{format} extension"
    ))
  }
}

fn build_voice_clone_data_uri(path: &std::path::Path) -> Result<String, String> {
  let (format, mime_type) = audio_format(path)?;
  let bytes = std::fs::read(path)
    .map_err(|e| format!("Failed to read voice clone reference audio: {e}"))?;
  validate_audio_signature(format, &bytes)?;
  let data_uri = format!("data:{mime_type};base64,{}", STANDARD.encode(bytes));
  validate_voice_clone_data_uri_size(data_uri.len())?;
  Ok(data_uri)
}

// ---- 项目管理 ----

/// 获取项目根目录：`{audio_cache_dir}/projects/`。
fn projects_root(app: &AppHandle) -> Result<PathBuf, String> {
  let base = ensure_audio_dir(app)?;
  let root = base.join("projects");
  std::fs::create_dir_all(&root)
    .map_err(|e| format!("Failed to create projects root: {e}"))?;
  Ok(root)
}

fn validate_project_name(name: &str) -> Result<&str, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("Project name cannot be empty".into());
  }
  if trimmed == "."
    || trimmed == ".."
    || trimmed.starts_with('.')
    || trimmed.contains('/')
    || trimmed.contains('\\')
  {
    return Err("Project name cannot contain /, \\ or start with .".into());
  }
  Ok(trimmed)
}

fn project_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
  let validated = validate_project_name(name)?;
  Ok(projects_root(app)?.join(validated))
}

/// 列出所有已有项目名称。
///
/// 前端调用: `invoke("tts_list_projects")` → `string[]`
#[tauri::command]
pub fn tts_list_projects(app: AppHandle) -> Result<Vec<String>, String> {
  let root = projects_root(&app)?;
  let mut names: Vec<String> = Vec::new();
  for entry in std::fs::read_dir(&root)
    .map_err(|e| format!("Failed to read projects directory: {e}"))?
  {
    let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
    if entry
      .file_type()
      .map_err(|e| format!("Failed to get file type: {e}"))?
      .is_dir()
    {
      if let Some(name) = entry.file_name().to_str() {
        names.push(name.to_string());
      }
    }
  }
  names.sort();
  Ok(names)
}

/// 创建新项目（在 caches 目录下创建子文件夹）。
///
/// 前端调用: `invoke("tts_create_project", { name })` → `string[]`（创建后的完整列表）
#[tauri::command]
pub fn tts_create_project(name: String, app: AppHandle) -> Result<Vec<String>, String> {
  let trimmed = validate_project_name(&name)?.to_string();
  let dir = project_dir(&app, &trimmed)?;
  if dir.exists() {
    return Err(format!("Project \"{trimmed}\" already exists"));
  }
  std::fs::create_dir_all(&dir)
    .map_err(|e| format!("Failed to create project directory: {e}"))?;
  log::info!("✓ 已创建项目: {}", dir.display());
  tts_list_projects(app)
}

/// 删除项目及其缓存音频。
#[tauri::command]
pub fn tts_delete_project(name: String, app: AppHandle) -> Result<Vec<String>, String> {
  let dir = project_dir(&app, &name)?;
  if dir.exists() {
    std::fs::remove_dir_all(&dir)
      .map_err(|e| format!("Failed to delete project directory: {e}"))?;
  }
  tts_list_projects(app)
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

/// 构建 models 列表端点：`GET {base}/v1/models`
///
/// 输入 baseUrl 可能是各种格式，统一提取到 `/v1` 层级后补 `/models`。
fn build_models_endpoint(base_url: &str) -> String {
  let url = base_url.trim_end_matches('/');
  // 去掉 /chat/completions 后缀
  let base = if url.ends_with("/chat/completions") {
    url.trim_end_matches("/chat/completions")
  } else {
    url
  };
  // 去掉 /v1 后缀（如果有），统一补 /v1/models
  let base = base.trim_end_matches("/v1").trim_end_matches('/');
  format!("{base}/v1/models")
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
    .map_err(|e| format!("Failed to get cwd: {e}"))?
    .join(".cache")
    .join("audio");
  log::info!("fallback local dir: {}", local.display());
  std::fs::create_dir_all(&local)
    .map_err(|e| format!("All directories unwritable, local fallback also failed: {local:?} -> {e}"))?;
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

/// 为 voice-clone 模式加载参考音频并编码为 base64。
///
/// 非 voice-clone 模式或路径为空时返回 `None`。
fn load_voice_clone_audio(params: &TtsParams, app: &AppHandle) -> Result<Option<String>, String> {
    if params.mode != TtsMode::VoiceClone {
        return Ok(None);
    }
    let Some(ref path) = params.voice_clone_path else {
        return Ok(None);
    };
    if path.is_empty() {
        return Ok(None);
    }
    let safe_path = is_in_audio_dir(app, path)?;
    Ok(Some(build_voice_clone_data_uri(&safe_path)?))
}

fn build_speech_body(
  params: &TtsParams,
  text: &str,
  voice_audio_data_uri: Option<&str>,
) -> Result<Value, String> {
  validate_tts_params(params)?;
  let mut messages = Vec::<Value>::with_capacity(2);

  let user_prompt = if params.mode == TtsMode::VoiceDesign {
    params.voice_design_prompt.trim()
  } else {
    params.performance_prompt.trim()
  };
  if !user_prompt.is_empty() {
    messages.push(serde_json::json!({
      "role": "user",
      "content": user_prompt,
    }));
  }

  messages.push(serde_json::json!({
    "role": "assistant",
    "content": text,
  }));

  let audio = match params.mode {
    TtsMode::VoiceDesign => serde_json::json!({ "format": "wav" }),
    TtsMode::VoiceClone => serde_json::json!({
      "format": "wav",
      "voice": voice_audio_data_uri.ok_or("Voice clone sample data is missing")?
    }),
    TtsMode::Basic => serde_json::json!({
      "format": "wav",
      "voice": &params.voice
    }),
  };

  Ok(serde_json::json!({
    "model": params.model,
    "messages": messages,
    "audio": audio
  }))
}

/// 发起一次 MiMo v2.5 TTS 请求，返回 wav 音频字节。
///
/// 三种模式共用同一个 chat-completions 端点，区别在于 model 和 messages/audio 字段。
async fn request_speech(
  params: &TtsParams,
  text: &str,
  voice_audio_data_uri: Option<&str>,
) -> Result<Vec<u8>, String> {
    let endpoint = build_chat_endpoint(&params.base_url);
    let body = build_speech_body(params, text, voice_audio_data_uri)?;

    let client = http_client();
    let resp = client
        .post(&endpoint)
        .header("api-key", &params.api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response JSON: {e}"))?;

    let audio_data = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("audio"))
        .and_then(|a| a.get("data"))
        .and_then(|d| d.as_str())
        .ok_or_else(|| {
            format!("Response missing choices[0].message.audio.data: {}", json)
        })?;

    STANDARD
        .decode(audio_data)
        .map_err(|e| format!("base64 decode failed: {e}"))
}

/// 为某一句文本生成音频并写入本地缓存（每次生成使用唯一文件名，不覆盖历史版本）。
///
/// 前端调用: `invoke("tts_generate", { sentenceId, text, params, project })`
/// - `project`（可选）: 项目名称，音频存入 `{cache}/audio/projects/{project}/`；为 `None` 时存入 `{cache}/audio/`
/// - 文件名格式: `{sanitized_sentenceId}_{timestamp_ms}.wav`，确保每次生成不覆盖旧文件
#[tauri::command]
pub async fn tts_generate(
  sentence_id: String,
  text: String,
  params: TtsParams,
  project: Option<String>,
  app: AppHandle,
) -> Result<TtsResult, String> {
  if text.trim().is_empty() {
    return Err("Text is empty".into());
  }
  if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
    return Err("Missing baseUrl or apiKey — configure them in Settings".into());
  }
  validate_tts_params(&params)?;

  let audio_dir = if let Some(ref proj) = project {
    let trimmed = proj.trim();
    if trimmed.is_empty() {
      ensure_audio_dir(&app)?
    } else {
      let dir = project_dir(&app, trimmed)?;
      std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create project directory: {e}"))?;
      dir
    }
  } else {
    ensure_audio_dir(&app)?
  };

  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis();
  let file_name = format!("{}_{}.wav", sanitize_filename(&sentence_id), timestamp);
  let file_path = audio_dir.join(&file_name);

  // 声音克隆模式：读取参考音频文件为 base64
  let voice_audio_data_uri = load_voice_clone_audio(&params, &app)?;

  let bytes = request_speech(&params, &text, voice_audio_data_uri.as_deref()).await?;

  std::fs::write(&file_path, &bytes)
    .map_err(|e| format!("Failed to write audio file: {file_path:?} -> {e}"))?;

  Ok(TtsResult {
    audio_path: file_path.to_string_lossy().to_string(),
  })
}

/// 用一段极短测试文本发起一次真实请求，验证 settings 是否可用。
///
/// 前端调用: `invoke("tts_test", { params })`
#[tauri::command]
pub async fn tts_test(params: TtsParams, app: AppHandle) -> Result<(), String> {
  if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
    return Err("Missing baseUrl or apiKey".into());
  }

  // 测试模式：声音克隆需要参考音频
  validate_tts_params(&params)?;
  let voice_audio_data_uri = load_voice_clone_audio(&params, &app)?;

  request_speech(&params, "test", voice_audio_data_uri.as_deref()).await?;
  Ok(())
}

fn voice_previews_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = ensure_audio_dir(app)?.join("voice-previews");
  std::fs::create_dir_all(&dir)
    .map_err(|e| format!("Failed to create voice preview directory: {e}"))?;
  Ok(dir)
}

/// 使用当前声音克隆配置生成独立试听文件，不写入句子历史。
#[tauri::command]
pub async fn tts_preview_voice_clone(
  text: String,
  params: TtsParams,
  app: AppHandle,
) -> Result<TtsResult, String> {
  if text.trim().is_empty() {
    return Err("Preview text is empty".into());
  }
  if params.mode != TtsMode::VoiceClone {
    return Err("Voice clone preview requires voice-clone mode".into());
  }
  if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
    return Err("Missing baseUrl or apiKey — configure them in Settings".into());
  }
  validate_tts_params(&params)?;
  let voice_audio_data_uri = load_voice_clone_audio(&params, &app)?;
  let bytes = request_speech(&params, text.trim(), voice_audio_data_uri.as_deref()).await?;
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis();
  let file_path = voice_previews_dir(&app)?.join(format!("clone_preview_{timestamp}.wav"));
  std::fs::write(&file_path, &bytes)
    .map_err(|e| format!("Failed to write voice clone preview: {e}"))?;
  Ok(TtsResult {
    audio_path: file_path.to_string_lossy().to_string(),
  })
}

/// 获取可用模型列表。
///
/// 调用 `GET {baseUrl}/v1/models`，解析响应中的 `data[].id` 返回模型 ID 列表。
/// 前端调用: `invoke("tts_list_models", { baseUrl, apiKey })` → `string[]`
#[tauri::command]
pub async fn tts_list_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
  if base_url.trim().is_empty() || api_key.trim().is_empty() {
    return Err("Missing baseUrl or apiKey".into());
  }

  let endpoint = build_models_endpoint(&base_url);
  log::info!("Fetching models: {endpoint}");

  let client = http_client();
  let resp = client
    .get(&endpoint)
    .header("api-key", &api_key)
    .send()
    .await
    .map_err(|e| format!("Request failed: {e}"))?;

  let status = resp.status();
  if !status.is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(format!("HTTP {status}: {text}"));
  }

  let json: Value = resp
    .json()
    .await
    .map_err(|e| format!("Failed to parse response JSON: {e}"))?;

  let models = json
    .get("data")
    .and_then(|d| d.as_array())
    .ok_or_else(|| format!("Response missing data array: {json}"))?;

  let ids: Vec<String> = models
    .iter()
    .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(String::from))
    .collect();

  if ids.is_empty() {
    return Err("Model list is empty".into());
  }

  log::info!("Fetched {} models", ids.len());
  Ok(ids)
}

/// 读取本地音频文件，返回 base64 编码的字符串。
///
/// 前端调用: `invoke("tts_read_audio", { path })` → string (base64)
/// 使用 base64 而非原始 bytes，避免 Tauri v2 IPC 对二进制数据的序列化问题。
#[tauri::command]
pub fn tts_read_audio(path: String, app: AppHandle) -> Result<String, String> {
  let safe_path = is_in_audio_dir(&app, &path)?;
  let bytes = std::fs::read(&safe_path).map_err(|e| format!("Failed to read audio file: {e}"))?;
  Ok(STANDARD.encode(&bytes))
}

/// 删除不再被项目元数据引用的缓存音频。
#[tauri::command]
pub fn tts_delete_audio_files(paths: Vec<String>, app: AppHandle) -> Result<(), String> {
  for path in paths {
    let safe_path = is_in_audio_dir(&app, &path)?;
    if safe_path.is_file() {
      std::fs::remove_file(&safe_path)
        .map_err(|e| format!("Failed to delete cached audio file: {e}"))?;
    }
  }
  Ok(())
}

/// 返回音色样本库目录，不存在则创建。
///
/// 路径：`{audio_base_dir}/voice-samples/`。
fn voice_samples_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = ensure_audio_dir(app)?;
    let dir = base.join("voice-samples");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create voice samples directory: {e}"))?;
    Ok(dir)
}

/// 将外部音频文件复制到音色样本库。
///
/// 前端调用: `invoke("save_voice_sample", { sourcePath, sampleId })` → 路径、格式与大小元数据
#[tauri::command]
pub fn save_voice_sample(
    source_path: String,
    sample_id: String,
    app: AppHandle,
) -> Result<VoiceSampleResult, String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err(format!("Source file not found: {source_path}"));
    }
    let (format, mime_type) = audio_format(src)?;
    let bytes = std::fs::read(src).map_err(|e| format!("Failed to read audio file: {e}"))?;
    validate_audio_signature(format, &bytes)?;
    let encoded_size = format!("data:{mime_type};base64,{}", STANDARD.encode(&bytes)).len();
    validate_voice_clone_data_uri_size(encoded_size)?;
    let dir = voice_samples_dir(&app)?;
    let file_name = format!("{}.{}", sanitize_filename(&sample_id), format);
    let dest = dir.join(&file_name);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Failed to save audio file: {e}"))?;

    log::info!("✓ 已保存音色样本: {}", dest.display());
    Ok(VoiceSampleResult {
      file_path: dest.to_string_lossy().to_string(),
      format: format.to_string(),
      mime_type: mime_type.to_string(),
      byte_size: bytes.len() as u64,
      encoded_size,
    })
}

/// 删除音色样本文件。
///
/// 前端调用: `invoke("delete_voice_sample", { path })`
#[tauri::command]
pub fn delete_voice_sample(path: String, app: AppHandle) -> Result<(), String> {
    let safe_path = is_in_audio_dir(&app, &path)?;
    if safe_path.exists() {
        std::fs::remove_file(&safe_path).map_err(|e| format!("Failed to delete sample file: {e}"))?;
        log::info!("✓ 已删除音色样本: {}", safe_path.display());
    }
    Ok(())
}

// ---- API Key 安全存储（macOS Keychain） ----

const KEYCHAIN_SERVICE: &str = "com.draft-whisper.api-key";
const KEYCHAIN_ACCOUNT: &str = "default";

/// 将 API Key 存入 macOS Keychain。
///
/// 前端调用: `invoke("save_api_key", { apiKey })`
#[tauri::command]
pub fn save_api_key(api_key: String) -> Result<(), String> {
    // 先尝试更新，失败则新增
    let updated = std::process::Command::new("security")
        .args([
            "add-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", KEYCHAIN_ACCOUNT,
            "-w", &api_key,
            "-U", // update if exists
        ])
        .output()
        .map_err(|e| format!("Failed to run security command: {e}"))?;

    if !updated.status.success() {
        let stderr = String::from_utf8_lossy(&updated.stderr);
        return Err(format!("Failed to save API key to Keychain: {stderr}"));
    }
    Ok(())
}

/// 从 macOS Keychain 读取 API Key。
///
/// 前端调用: `invoke("load_api_key")` → `string | null`
#[tauri::command]
pub fn load_api_key() -> Result<Option<String>, String> {
    let output = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", KEYCHAIN_ACCOUNT,
            "-w", // output password only
        ])
        .output()
        .map_err(|e| format!("Failed to run security command: {e}"))?;

    if !output.status.success() {
        // errSecItemNotFound (-25300) — normal when no key stored yet
        return Ok(None);
    }

    let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if key.is_empty() {
        return Ok(None);
    }
    Ok(Some(key))
}

/// 从 macOS Keychain 删除 API Key。
///
/// 前端调用: `invoke("delete_api_key")`
#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    let output = std::process::Command::new("security")
        .args([
            "delete-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", KEYCHAIN_ACCOUNT,
        ])
        .output()
        .map_err(|e| format!("Failed to run security command: {e}"))?;

    // Even if the entry doesn't exist, treat as success
    if !output.status.success() {
        log::warn!("delete_api_key: security returned non-zero, entry may not exist");
    }
    Ok(())
}

/// 将音频文件复制到 macOS 系统剪贴板（文件引用，非文本）。
///
/// 使用 AppleScript 的 `set the clipboard to (POSIX file "...")` 实现。
/// 用户随后可以在 Finder / 剪映 / Premiere 等应用中 Cmd+V 粘贴文件。
///
/// 前端调用: `invoke("tts_copy_to_clipboard", { path })`
#[tauri::command]
pub fn tts_copy_to_clipboard(path: String, app: AppHandle) -> Result<(), String> {
  let safe_path = is_in_audio_dir(&app, &path)?;

  // 先转义反斜杠，再转义双引号（顺序不能反）
  let escaped = safe_path
    .to_string_lossy()
    .replace('\\', "\\\\")
    .replace('"', "\\\"");
  let script = format!("set the clipboard to (POSIX file \"{}\")", escaped);

  #[cfg(target_os = "macos")]
  {
    let output = std::process::Command::new("osascript")
      .args(["-e", &script])
      .output()
      .map_err(|e| format!("Failed to execute osascript: {e}"))?;

    if !output.status.success() {
      let stderr = String::from_utf8_lossy(&output.stderr);
      return Err(format!("Failed to copy to clipboard: {stderr}"));
    }
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = script; // 非 macOS 平台暂不支持
    return Err("File copy to clipboard is only supported on macOS".into());
  }

  Ok(())
}

/// 在 Finder 中显示音频文件。
///
/// 使用 `open -R <path>` 打开 Finder 并选中该文件。
///
/// 前端调用: `invoke("tts_show_in_finder", { path })`
#[tauri::command]
pub fn tts_show_in_finder(path: String, app: AppHandle) -> Result<(), String> {
  let safe_path = is_in_audio_dir(&app, &path)?;
  let safe_path_str = safe_path.to_string_lossy().to_string();

  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .args(["-R", &safe_path_str])
      .spawn()
      .map_err(|e| format!("Failed to open Finder: {e}"))?;
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = safe_path_str;
    return Err("Show in Finder is only supported on macOS".into());
  }

  Ok(())
}

/// 发起 macOS 原生文件拖拽，将音频文件拖入剪映/Premiere 等剪辑软件。
///
/// 使用 `NSView::beginDraggingSessionWithItems:event:source:` 创建真正的
/// NSDraggingSession，与 Finder 拖拽行为一致。
/// WebView 的 HTML5 拖拽只传文本数据，剪映不认；原生拖拽传 NSURL，
/// 剪映/Premiere 等都能正确接收。
///
/// 前端调用: `invoke("tts_drag_file", { path })`
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn tts_drag_file(path: String, window: tauri::Window, app: AppHandle) -> Result<(), String> {
  let safe_path = is_in_audio_dir(&app, &path)?;
  let safe_path_str = safe_path.to_string_lossy().to_string();

  use objc::class;
  use objc::declare::ClassDecl;
  use objc::msg_send;
  use objc::runtime::{Class, Object, Sel};
  use objc::sel;
  use objc::sel_impl;
  use std::ffi::{c_double, CString};

  let ns_view_ptr = window.ns_view().map_err(|e| format!("Failed to get ns_view: {e}"))?;

  unsafe {
    let content_view = ns_view_ptr as *mut Object;

    // --- Dynamic class for NSDraggingSource ---
    let drag_source_class = {
      static mut CLS: *const Class = std::ptr::null();
      static ONCE: std::sync::Once = std::sync::Once::new();
      ONCE.call_once(|| {
        let mut decl =
          ClassDecl::new("DWFileDragSource", class!(NSObject)).unwrap();
        decl.add_method(
          sel!(draggingSession:sourceOperationMaskForDraggingContext:),
          dragging_source_op_mask as extern "C" fn(&Object, Sel, *mut Object, isize) -> u64,
        );
        CLS = decl.register();
      });
      CLS
    };

    extern "C" fn dragging_source_op_mask(
      _this: &Object,
      _sel: Sel,
      _session: *mut Object,
      _context: isize,
    ) -> u64 {
      1 // NSDragOperationCopy
    }

    // --- Drag source instance ---
    let source: *mut Object = msg_send![drag_source_class, new];

    // --- File URL ---
    // CString 确保 \0 结尾；stringWithUTF8String: 要求 C 风格字符串（null-terminated）
    let c_path = CString::new(safe_path_str).map_err(|e| format!("Path contains invalid characters: {e}"))?;
    let path_str: *mut Object =
      msg_send![class!(NSString), stringWithUTF8String: c_path.as_ptr()];
    let file_url: *mut Object = msg_send![class!(NSURL), fileURLWithPath: path_str];

    // --- Audio file icon via NSWorkspace (public API) ---
    let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
    let ext_str: *mut Object =
      msg_send![class!(NSString), stringWithUTF8String: b"wav\0".as_ptr()];
    let drag_image: *mut Object = msg_send![workspace, iconForFileType: ext_str];

    // --- Mouse location (global, in screen coordinates) ---
    let mouse_loc: NSPoint = msg_send![class!(NSEvent), mouseLocation];

    // --- Window number ---
    let ns_window: *mut Object = msg_send![content_view, window];
    let window_number: i64 = msg_send![ns_window, windowNumber];

    // --- Synthesize mouse-down event ---
    let event_type: u64 = 1; // NSLeftMouseDown
    let mod_flags: u64 = 0;
    let ts: c_double = 0.0;
    let ctx: *mut Object = std::ptr::null_mut();
    let ev_num: i64 = 0;
    let click_count: i64 = 1;
    let pressure: f32 = 1.0;
    let event: *mut Object = msg_send![
      class!(NSEvent),
      mouseEventWithType: event_type
      location: mouse_loc
      modifierFlags: mod_flags
      timestamp: ts
      windowNumber: window_number
      context: ctx
      eventNumber: ev_num
      clickCount: click_count
      pressure: pressure
    ];

    // --- NSDraggingItem with the file URL as pasteboard content ---
    let item: *mut Object = msg_send![class!(NSDraggingItem), alloc];
    let item: *mut Object = msg_send![item, initWithPasteboardWriter: file_url];

    // Set the drag image at mouse location (64×64 icon)
    let drag_frame = NSRect {
      origin: NSPoint {
        x: mouse_loc.x - 32.0,
        y: mouse_loc.y - 32.0,
      },
      size: NSSize {
        width: 64.0,
        height: 64.0,
      },
    };
    let _: () = msg_send![item, setDraggingFrame: drag_frame contents: drag_image];

    // --- NSArray with the dragging item ---
    let items: *mut Object = msg_send![class!(NSArray), arrayWithObject: item];

    // --- Begin native dragging session from the content view ---
    // Returns an NSDraggingSession (autoreleased); the session retains
    // items and source internally, so they survive after this function returns.
    let _session: *mut Object = msg_send![
      content_view,
      beginDraggingSessionWithItems: items
      event: event
      source: source
    ];

    log::info!("原生文件拖拽已启动: {}", c_path.to_string_lossy());
  }

  Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn tts_drag_file(path: String, _window: tauri::Window, app: AppHandle) -> Result<(), String> {
  let _ = (path, app);
  Err("Native file drag is only supported on macOS".into())
}

// NSPoint / NSSize / NSRect — 与 CoreGraphics / AppKit 布局一致
#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSPoint {
  x: f64,
  y: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSSize {
  width: f64,
  height: f64,
}

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct NSRect {
  origin: NSPoint,
  size: NSSize,
}

#[cfg(test)]
mod tests {
  use super::{
    audio_format, build_chat_endpoint, build_models_endpoint, build_speech_body,
    sanitize_filename, validate_audio_signature, validate_project_name,
    validate_voice_clone_data_uri_size, TtsMode, TtsParams, MAX_VOICE_CLONE_DATA_URI_SIZE,
  };

  fn params(mode: TtsMode, model: &str) -> TtsParams {
    TtsParams {
      base_url: "https://example.com/v1".into(),
      api_key: "test-key".into(),
      model: model.into(),
      mode,
      voice: "冰糖".into(),
      voice_design_prompt: "温柔的年轻女声".into(),
      voice_clone_path: Some("/audio/sample.wav".into()),
      performance_prompt: "语速稍慢，像在讲故事".into(),
    }
  }

  #[test]
  fn normalizes_mimo_endpoints() {
    assert_eq!(
      build_chat_endpoint("https://example.com/v1/"),
      "https://example.com/v1/chat/completions"
    );
    assert_eq!(
      build_chat_endpoint("https://example.com/v1/chat/completions"),
      "https://example.com/v1/chat/completions"
    );
    assert_eq!(
      build_models_endpoint("https://example.com/v1/chat/completions"),
      "https://example.com/v1/models"
    );
  }

  #[test]
  fn rejects_unsafe_project_names() {
    for invalid in ["", " ", ".hidden", "..", "../escape", "nested/name", "nested\\name"] {
      assert!(validate_project_name(invalid).is_err(), "accepted {invalid:?}");
    }
    assert_eq!(validate_project_name(" Demo Project ").unwrap(), "Demo Project");
  }

  #[test]
  fn sanitizes_generated_file_names() {
    assert_eq!(sanitize_filename("001_你好/A"), "001____A");
    assert_eq!(sanitize_filename("safe-Name_42"), "safe-Name_42");
  }

  #[test]
  fn builds_voice_clone_request_with_data_uri_and_performance_prompt() {
    let params = params(TtsMode::VoiceClone, "mimo-v2.5-tts-voiceclone");
    let body = build_speech_body(
      &params,
      "你好",
      Some("data:audio/wav;base64,UklGRg=="),
    )
    .unwrap();

    assert_eq!(body["model"], "mimo-v2.5-tts-voiceclone");
    assert_eq!(body["messages"][0]["role"], "user");
    assert_eq!(body["messages"][0]["content"], "语速稍慢，像在讲故事");
    assert_eq!(body["messages"][1]["role"], "assistant");
    assert_eq!(body["audio"]["voice"], "data:audio/wav;base64,UklGRg==");
  }

  #[test]
  fn builds_voice_design_request_from_the_user_description() {
    let params = params(TtsMode::VoiceDesign, "mimo-v2.5-tts-voicedesign");
    let body = build_speech_body(&params, "你好", None).unwrap();

    assert_eq!(body["messages"][0]["role"], "user");
    assert_eq!(body["messages"][0]["content"], "温柔的年轻女声");
    assert_eq!(body["messages"][1]["role"], "assistant");
    assert!(body["audio"].get("voice").is_none());
  }

  #[test]
  fn rejects_model_mode_mismatch() {
    let params = params(TtsMode::VoiceClone, "mimo-v2.5-tts");
    assert!(build_speech_body(&params, "你好", Some("data:audio/wav;base64,AA==")).is_err());
  }

  #[test]
  fn validates_supported_audio_formats_and_signatures() {
    assert_eq!(audio_format(std::path::Path::new("sample.wav")).unwrap().0, "wav");
    assert_eq!(audio_format(std::path::Path::new("sample.mp3")).unwrap().1, "audio/mpeg");
    assert!(audio_format(std::path::Path::new("sample.m4a")).is_err());
    assert!(validate_audio_signature("wav", b"RIFF\0\0\0\0WAVE").is_ok());
    assert!(validate_audio_signature("mp3", b"ID3\0").is_ok());
    assert!(validate_audio_signature("wav", b"not-a-wave").is_err());
  }

  #[test]
  fn enforces_ten_megabyte_encoded_sample_limit() {
    assert!(validate_voice_clone_data_uri_size(MAX_VOICE_CLONE_DATA_URI_SIZE).is_ok());
    assert!(validate_voice_clone_data_uri_size(MAX_VOICE_CLONE_DATA_URI_SIZE + 1).is_err());
  }
}
