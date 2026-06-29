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
/// 前端调用: `invoke("tts_generate", { sentenceId, text, params, outputDir })`
/// - `output_dir`（可选）: 自定义输出目录；为 `None` 时使用默认三级 fallback 目录
#[tauri::command]
pub async fn tts_generate(
  sentence_id: String,
  text: String,
  params: TtsParams,
  output_dir: Option<String>,
  app: AppHandle,
) -> Result<TtsResult, String> {
  if text.trim().is_empty() {
    return Err("文本为空".into());
  }
  if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
    return Err("缺少 baseUrl 或 apiKey，请先在设置中填写".into());
  }

  let audio_dir = if let Some(dir) = output_dir {
    let path = PathBuf::from(&dir);
    std::fs::create_dir_all(&path)
      .map_err(|e| format!("创建输出目录失败: {dir} -> {e}"))?;
    path
  } else {
    ensure_audio_dir(&app)?
  };
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

  let client = reqwest::Client::new();
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
pub fn tts_read_audio(path: String) -> Result<Response, String> {
  let bytes = std::fs::read(&path).map_err(|e| format!("读取音频文件失败: {e}"))?;
  Ok(Response::new(bytes))
}

/// 将音频文件复制到 macOS 系统剪贴板（文件引用，非文本）。
///
/// 使用 AppleScript 的 `set the clipboard to (POSIX file "...")` 实现。
/// 用户随后可以在 Finder / 剪映 / Premiere 等应用中 Cmd+V 粘贴文件。
///
/// 前端调用: `invoke("tts_copy_to_clipboard", { path })`
#[tauri::command]
pub fn tts_copy_to_clipboard(path: String) -> Result<(), String> {
  if !std::path::Path::new(&path).exists() {
    return Err(format!("文件不存在: {path}"));
  }

  let script = format!("set the clipboard to (POSIX file \"{}\")", path.replace('"', "\\\""));

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
pub fn tts_show_in_finder(path: String) -> Result<(), String> {
  if !std::path::Path::new(&path).exists() {
    return Err(format!("文件不存在: {path}"));
  }

  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .args(["-R", &path])
      .spawn()
      .map_err(|e| format!("打开 Finder 失败: {e}"))?;
  }

  #[cfg(not(target_os = "macos"))]
  {
    let _ = path;
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
pub fn tts_drag_file(path: String, window: tauri::Window) -> Result<(), String> {
  use objc::class;
  use objc::declare::ClassDecl;
  use objc::msg_send;
  use objc::runtime::{Class, Object, Sel};
  use objc::sel;
  use objc::sel_impl;
  use std::ffi::{c_double, CString};

  if !std::path::Path::new(&path).exists() {
    return Err(format!("文件不存在: {path}"));
  }

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
    let c_path = CString::new(path).map_err(|e| format!("路径含非法字符: {e}"))?;
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
pub fn tts_drag_file(path: String, _window: tauri::Window) -> Result<(), String> {
  let _ = path;
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
