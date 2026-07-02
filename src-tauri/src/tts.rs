use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{ipc::Response, AppHandle, Manager};

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
        .map_err(|e| format!("canonicalize audio dir 失败: {e}"))?;

    let target = std::path::Path::new(path);
    let canonical_path = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("路径无法解析: {e}"))?
    } else {
        // 文件不存在时，验证其父目录在音频目录内，再拼回文件名
        let parent = target.parent().unwrap_or(target);
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("父目录不存在或无法解析: {e}"))?;
        canonical_parent.join(target.file_name().unwrap_or_default())
    };

    if !canonical_path.starts_with(&canonical_dir) {
        return Err(format!(
            "路径不在音频目录内: {} (允许的目录: {})",
            path,
            audio_dir.display()
        ));
    }
    Ok(canonical_path)
}

/// 与前端 Settings 一一对应的 TTS 调用参数。
///
/// 支持三种模式：
/// - `basic`：基础模式，使用预置音色（model=mimo-v2.5-tts）
/// - `voice-design`：声音设计（model=mimo-v2.5-tts-voicedesign）
/// - `voice-clone`：声音克隆（model=mimo-v2.5-tts-voiceclone）
///
/// `rename_all = "camelCase"`：前端传 camelCase（baseUrl/apiKey），
/// Rust 内部仍用 snake_case（base_url/api_key）。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsParams {
    pub base_url: String,
    pub api_key: String,
    pub model: String,               // 用户选择的模型 ID
    pub mode: String,              // "basic" | "voice-design" | "voice-clone"
    pub voice: String,             // 基础模式的预置音色名
    pub voice_design_prompt: String,  // 声音设计的描述
    pub voice_clone_path: Option<String>,     // 声音克隆的参考音频路径（本地路径）
}

/// `tts_generate` 的返回值。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
  pub audio_path: String,
}

// ---- 项目管理 ----

/// 获取项目根目录：`{audio_cache_dir}/projects/`。
fn projects_root(app: &AppHandle) -> Result<PathBuf, String> {
  let base = ensure_audio_dir(app)?;
  let root = base.join("projects");
  std::fs::create_dir_all(&root)
    .map_err(|e| format!("创建项目根目录失败: {e}"))?;
  Ok(root)
}

/// 列出所有已有项目名称。
///
/// 前端调用: `invoke("tts_list_projects")` → `string[]`
#[tauri::command]
pub fn tts_list_projects(app: AppHandle) -> Result<Vec<String>, String> {
  let root = projects_root(&app)?;
  let mut names: Vec<String> = Vec::new();
  for entry in std::fs::read_dir(&root)
    .map_err(|e| format!("读取项目目录失败: {e}"))?
  {
    let entry = entry.map_err(|e| format!("读取条目失败: {e}"))?;
    if entry
      .file_type()
      .map_err(|e| format!("获取文件类型失败: {e}"))?
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
  let trimmed = name.trim().to_string();
  if trimmed.is_empty() {
    return Err("项目名称不能为空".into());
  }
  if trimmed.contains('/') || trimmed.contains('\\') || trimmed.starts_with('.') {
    return Err("项目名称不能包含 /、\\ 或以 . 开头".into());
  }
  let root = projects_root(&app)?;
  let dir = root.join(&trimmed);
  if dir.exists() {
    return Err(format!("项目「{trimmed}」已存在"));
  }
  std::fs::create_dir_all(&dir)
    .map_err(|e| format!("创建项目目录失败: {e}"))?;
  log::info!("✓ 已创建项目: {}", dir.display());
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
/// 三种模式共用同一个 chat-completions 端点，区别在于 model 和 messages/audio 字段：
/// - basic: model=mimo-v2.5-tts, audio.voice=预置音色名
/// - voice-design: model=mimo-v2.5-tts-voicedesign, user message=音色描述, 无 audio.voice
/// - voice-clone: model=mimo-v2.5-tts-voiceclone, audio.voice=base64 参考音频
async fn request_speech(params: &TtsParams, text: &str, voice_audio_base64: Option<&str>) -> Result<Vec<u8>, String> {
    let endpoint = build_chat_endpoint(&params.base_url);

    // messages：构建角色消息
    let mut messages = Vec::<Value>::with_capacity(2);

    // voice-design 模式：音色描述作为 user message（必填）
    if params.mode == "voice-design" && !params.voice_design_prompt.is_empty() {
        messages.push(serde_json::json!({
            "role": "user",
            "content": &params.voice_design_prompt,
        }));
    }

    // 目标文本放在 assistant 消息中
    messages.push(serde_json::json!({
        "role": "assistant",
        "content": text,
    }));

    // audio 字段：不同模式不同结构
    let audio = match params.mode.as_str() {
        "voice-design" => {
            serde_json::json!({
                "format": "wav"
            })
        }
        "voice-clone" => {
            serde_json::json!({
                "format": "wav",
                "voice": voice_audio_base64.unwrap_or("")
            })
        }
        _ => {
            serde_json::json!({
                "format": "wav",
                "voice": &params.voice
            })
        }
    };

    let body = serde_json::json!({
        "model": params.model,
        "messages": messages,
        "audio": audio
    });

    let client = http_client();
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
    return Err("文本为空".into());
  }
  if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
    return Err("缺少 baseUrl 或 apiKey，请先在设置中填写".into());
  }

  let audio_dir = if let Some(ref proj) = project {
    let trimmed = proj.trim();
    if trimmed.is_empty() {
      ensure_audio_dir(&app)?
    } else {
      let root = projects_root(&app)?;
      let dir = root.join(trimmed);
      std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建项目目录失败: {e}"))?;
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
  let voice_audio_base64 = if params.mode == "voice-clone" {
    if let Some(ref path) = params.voice_clone_path {
      if !path.is_empty() {
        let audio_bytes = std::fs::read(path)
          .map_err(|e| format!("读取声音克隆参考音频失败: {e}"))?;
        Some(STANDARD.encode(&audio_bytes))
      } else {
        None
      }
    } else {
      None
    }
  } else {
    None
  };

  let bytes = request_speech(&params, &text, voice_audio_base64.as_deref()).await?;

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

  // 测试模式：声音克隆需要参考音频
    let voice_audio_base64 = if params.mode == "voice-clone" {
      if let Some(ref path) = params.voice_clone_path {
        if !path.is_empty() {
          let audio_bytes = std::fs::read(path)
            .map_err(|e| format!("读取声音克隆参考音频失败: {e}"))?;
          Some(STANDARD.encode(&audio_bytes))
        } else {
          None
        }
      } else {
        None
      }
    } else {
      None
    };

    request_speech(&params, "测试", voice_audio_base64.as_deref()).await?;
  Ok(())
}

/// 获取可用模型列表。
///
/// 调用 `GET {baseUrl}/v1/models`，解析响应中的 `data[].id` 返回模型 ID 列表。
/// 前端调用: `invoke("tts_list_models", { baseUrl, apiKey })` → `string[]`
#[tauri::command]
pub async fn tts_list_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
  if base_url.trim().is_empty() || api_key.trim().is_empty() {
    return Err("缺少 baseUrl 或 apiKey".into());
  }

  let endpoint = build_models_endpoint(&base_url);
  log::info!("获取模型列表: {endpoint}");

  let client = http_client();
  let resp = client
    .get(&endpoint)
    .header("api-key", &api_key)
    .send()
    .await
    .map_err(|e| format!("请求失败: {e}"))?;

  let status = resp.status();
  if !status.is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(format!("HTTP {status}: {text}"));
  }

  let json: Value = resp
    .json()
    .await
    .map_err(|e| format!("解析响应 JSON 失败: {e}"))?;

  let models = json
    .get("data")
    .and_then(|d| d.as_array())
    .ok_or_else(|| format!("响应中缺少 data 数组: {json}"))?;

  let ids: Vec<String> = models
    .iter()
    .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(String::from))
    .collect();

  if ids.is_empty() {
    return Err("模型列表为空".into());
  }

  log::info!("获取到 {} 个模型", ids.len());
  Ok(ids)
}

/// 读取本地音频文件字节，供前端转 Blob URL 播放。
///
/// 前端调用: `invoke("tts_read_audio", { path })` → ArrayBuffer
#[tauri::command]
pub fn tts_read_audio(path: String, app: AppHandle) -> Result<Response, String> {
  let safe_path = is_in_audio_dir(&app, &path)?;
  let bytes = std::fs::read(&safe_path).map_err(|e| format!("读取音频文件失败: {e}"))?;
  Ok(Response::new(bytes))
}

/// 返回音色样本库目录，不存在则创建。
///
/// 路径：`{audio_base_dir}/voice-samples/`。
fn voice_samples_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = ensure_audio_dir(app)?;
    let dir = base.join("voice-samples");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建音色样本目录失败: {e}"))?;
    Ok(dir)
}

/// 将外部音频文件复制到音色样本库。
///
/// 前端调用: `invoke("save_voice_sample", { sourcePath, sampleId })` → `string`（存储后的绝对路径）
#[tauri::command]
pub fn save_voice_sample(
    source_path: String,
    sample_id: String,
    app: AppHandle,
) -> Result<String, String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err(format!("源文件不存在: {source_path}"));
    }

    let dir = voice_samples_dir(&app)?;

    // 保留原始扩展名
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("wav");
    let file_name = format!("{}.{}", sanitize_filename(&sample_id), ext);
    let dest = dir.join(&file_name);

    std::fs::copy(src, &dest).map_err(|e| format!("复制音频文件失败: {e}"))?;

    log::info!("✓ 已保存音色样本: {}", dest.display());
    Ok(dest.to_string_lossy().to_string())
}

/// 删除音色样本文件。
///
/// 前端调用: `invoke("delete_voice_sample", { path })`
#[tauri::command]
pub fn delete_voice_sample(path: String, app: AppHandle) -> Result<(), String> {
    let safe_path = is_in_audio_dir(&app, &path)?;
    if safe_path.exists() {
        std::fs::remove_file(&safe_path).map_err(|e| format!("删除样本文件失败: {e}"))?;
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
        .map_err(|e| format!("执行 security 命令失败: {e}"))?;

    if !updated.status.success() {
        let stderr = String::from_utf8_lossy(&updated.stderr);
        return Err(format!("保存 API Key 到 Keychain 失败: {stderr}"));
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
        .map_err(|e| format!("执行 security 命令失败: {e}"))?;

    if !output.status.success() {
        // errSecItemNotFound (-25300) — 正常情况，表示尚未存储
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
        .map_err(|e| format!("执行 security 命令失败: {e}"))?;

    // 即使条目不存在也视为成功
    if !output.status.success() {
        log::warn!("delete_api_key: security 命令返回非零，可能条目不存在");
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
      .map_err(|e| format!("执行 osascript 失败: {e}"))?;

    if !output.status.success() {
      let stderr = String::from_utf8_lossy(&output.stderr);
      return Err(format!("复制到剪贴板失败: {stderr}"));
    }
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = script; // 非 macOS 平台暂不支持
    return Err("文件复制到剪贴板仅支持 macOS".into());
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
      .map_err(|e| format!("打开 Finder 失败: {e}"))?;
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = safe_path_str;
    return Err("Show in Finder 仅支持 macOS".into());
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

  let ns_view_ptr = window.ns_view().map_err(|e| format!("获取 ns_view 失败: {e}"))?;

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
    let c_path = CString::new(safe_path_str).map_err(|e| format!("路径含非法字符: {e}"))?;
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
  Err("原生文件拖拽仅支持 macOS".into())
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
