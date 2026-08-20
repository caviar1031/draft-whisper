pub(crate) mod storage;
pub(crate) mod validation;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::AppHandle;

pub use storage::VoiceSampleResult;

/// 读取本地音频文件字节，返回 base64 编码字符串供前端转 Blob URL 播放。
#[tauri::command]
pub fn tts_read_audio(path: String, app: AppHandle) -> Result<String, String> {
    let safe_path = storage::is_in_audio_dir(&app, &path)?;
    let bytes = std::fs::read(&safe_path)
        .map_err(|e| format!("Failed to read audio file: {safe_path:?} -> {e}"))?;
    Ok(STANDARD.encode(&bytes))
}

/// 删除不再被项目元数据引用的缓存音频。
#[tauri::command]
pub fn tts_delete_audio_files(paths: Vec<String>, app: AppHandle) -> Result<(), String> {
    for path in paths {
        let safe_path = storage::is_in_audio_dir(&app, &path)?;
        if safe_path.is_file() {
            std::fs::remove_file(&safe_path)
                .map_err(|e| format!("Failed to delete cached audio file: {e}"))?;
        }
    }
    Ok(())
}

/// 将外部音频文件复制到音色样本库。
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
    let (format, mime_type) = validation::audio_format(src)?;
    let bytes = std::fs::read(src).map_err(|e| format!("Failed to read audio file: {e}"))?;
    validation::validate_audio_signature(format, &bytes)?;
    let duration_ms = validation::audio_duration_ms(format, &bytes)?;
    validation::validate_voice_clone_duration(duration_ms)?;
    let encoded_size = format!("data:{mime_type};base64,{}", STANDARD.encode(&bytes)).len();
    validation::validate_voice_clone_data_uri_size(encoded_size)?;
    let dir = storage::voice_samples_dir(&app)?;
    let file_name = format!("{}.{}", storage::sanitize_filename(&sample_id), format);
    let dest = dir.join(&file_name);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Failed to save audio file: {e}"))?;

    log::info!("Saved voice sample: {}", dest.display());
    Ok(VoiceSampleResult {
        file_path: dest.to_string_lossy().to_string(),
        format: format.to_string(),
        mime_type: mime_type.to_string(),
        byte_size: bytes.len() as u64,
        encoded_size,
        duration_ms,
    })
}

/// 删除音色样本文件。
#[tauri::command]
pub fn delete_voice_sample(path: String, app: AppHandle) -> Result<(), String> {
    let safe_path = storage::is_in_audio_dir(&app, &path)?;
    if safe_path.exists() {
        std::fs::remove_file(&safe_path)
            .map_err(|e| format!("Failed to delete sample file: {e}"))?;
        log::info!("Deleted voice sample: {}", safe_path.display());
    }
    Ok(())
}
