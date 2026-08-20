pub(crate) mod providers;
pub(crate) mod types;

use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::audio::storage::{
    ensure_audio_dir, is_in_audio_dir, sanitize_filename, voice_previews_dir,
};
use crate::audio::validation::build_voice_clone_data_uri;
use crate::projects::project_dir;
use crate::tts::providers::request_speech;
pub use crate::tts::types::*;

/// Load and validate a voice-clone reference for the TTS request.
///
/// The TTS layer owns mode-specific orchestration while audio storage remains
/// independent of TTS parameter types.
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

pub(crate) fn validate_tts_params(params: &TtsParams) -> Result<(), String> {
    if params.model.trim().is_empty() {
        return Err("Model ID is required".into());
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
    if matches!(params.provider, ProviderId::FishAudio | ProviderId::Custom)
        && params.mode != TtsMode::Basic
    {
        return Err("This provider currently supports basic TTS configurations only".into());
    }
    if params.mode == TtsMode::Basic && params.voice.trim().is_empty() {
        return Err("Voice ID is required for basic TTS".into());
    }
    Ok(())
}

/// 为某一句文本生成音频并写入本地缓存（每次生成使用唯一文件名，不覆盖历史版本）。
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
#[tauri::command]
pub async fn tts_test(params: TtsParams, app: AppHandle) -> Result<(), String> {
    if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
        return Err("Missing baseUrl or apiKey".into());
    }

    validate_tts_params(&params)?;
    let voice_audio_data_uri = load_voice_clone_audio(&params, &app)?;

    request_speech(&params, "test", voice_audio_data_uri.as_deref()).await?;
    Ok(())
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

/// 为基础音色或声音设计生成可播放的独立试听文件。
#[tauri::command]
pub async fn tts_preview_voice(
    text: String,
    params: TtsParams,
    app: AppHandle,
) -> Result<TtsResult, String> {
    if text.trim().is_empty() {
        return Err("Preview text is empty".into());
    }
    if params.mode == TtsMode::VoiceClone {
        return Err("Use the voice clone preview command for voice-clone mode".into());
    }
    if params.base_url.trim().is_empty() || params.api_key.trim().is_empty() {
        return Err("Missing baseUrl or apiKey — configure them in Settings".into());
    }
    validate_tts_params(&params)?;
    let bytes = request_speech(&params, text.trim(), None).await?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_path = voice_previews_dir(&app)?.join(format!("voice_preview_{timestamp}.wav"));
    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("Failed to write voice preview: {e}"))?;
    Ok(TtsResult {
        audio_path: file_path.to_string_lossy().to_string(),
    })
}
