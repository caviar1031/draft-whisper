use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// 旧版本使用过的 Bundle Identifier。
///
/// macOS 会把 Bundle Identifier 纳入缓存目录；应用升级后，项目元数据中
/// 可能仍然引用这些目录里的历史音频。它们只作为受限的兼容 allowlist，
/// 新生成的音频仍始终写入当前应用目录。
const LEGACY_APP_IDENTIFIERS: &[&str] = &["com.draftwhisper.app", "top.caviarlab.draftwhisper"];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSampleResult {
    pub file_path: String,
    pub format: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub encoded_size: usize,
    pub duration_ms: u64,
}

/// 返回当前目录及历史版本目录中的已存在音频目录。
pub(crate) fn allowed_audio_dirs(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let current = ensure_audio_dir(app)?;
    let mut dirs = vec![current];

    for base in [
        app.path().app_cache_dir().ok(),
        app.path().app_data_dir().ok(),
    ]
    .into_iter()
    .flatten()
    {
        let Some(parent) = base.parent() else {
            continue;
        };
        for identifier in LEGACY_APP_IDENTIFIERS {
            let legacy = parent.join(identifier).join("audio");
            if legacy.is_dir() && !dirs.iter().any(|dir| dir == &legacy) {
                dirs.push(legacy);
            }
        }
    }

    Ok(dirs)
}

pub(crate) fn is_path_in_allowed_dirs(path: &Path, dirs: &[PathBuf]) -> bool {
    dirs.iter().any(|dir| path.starts_with(dir))
}

/// 校验路径是否在受信任的音频缓存目录内（防止路径遍历攻击）。
///
/// 会 canonicalize 路径以解析 `..` 等遍历符号。
/// 文件不存在时（如 delete 场景），校验其父目录。
pub(crate) fn is_in_audio_dir(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let audio_dirs = allowed_audio_dirs(app)?;
    let canonical_dirs = audio_dirs
        .iter()
        .map(|dir| {
            dir.canonicalize()
                .map_err(|e| format!("Failed to canonicalize audio dir: {e}"))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let target = Path::new(path);
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

    if !is_path_in_allowed_dirs(&canonical_path, &canonical_dirs) {
        let allowed = canonical_dirs
            .iter()
            .map(|dir| dir.display().to_string())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "Path is outside audio directories: {} (allowed: {})",
            path, allowed
        ));
    }
    Ok(canonical_path)
}

/// 返回音频缓存目录，不存在则创建。
///
/// 尝试顺序：`app_cache_dir` → `app_data_dir` → 项目本地 `.cache/audio`。
/// macOS sandbox 下前两个可能被 TCC 拒绝写入，最后用项目本地目录兜底。
pub(crate) fn ensure_audio_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(p) = app.path().app_cache_dir() {
        candidates.push(p.join("audio"));
        log::info!("Candidate app cache directory: {}", p.display());
    }
    if let Ok(p) = app.path().app_data_dir() {
        candidates.push(p.join("audio"));
        log::info!("Candidate app data directory: {}", p.display());
    }

    for dir in &candidates {
        log::info!("Trying audio directory: {}", dir.display());
        if let Err(e) = std::fs::create_dir_all(dir) {
            log::warn!("Failed to create audio directory {dir:?}: {e}");
            continue;
        }
        // 验证可写
        let probe = dir.join("._wprobe");
        match std::fs::write(&probe, b"") {
            Ok(()) => {
                let _ = std::fs::remove_file(&probe);
                log::info!("Using audio directory: {}", dir.display());
                return Ok(dir.clone());
            }
            Err(e) => {
                log::warn!("Failed to write audio directory probe {dir:?}: {e}");
                let _ = std::fs::remove_file(&probe);
            }
        }
    }

    // 最终 fallback：项目本地 .cache/audio（dev 模式可写）
    let local = std::env::current_dir()
        .map_err(|e| format!("Failed to get cwd: {e}"))?
        .join(".cache")
        .join("audio");
    log::info!("Using local audio directory fallback: {}", local.display());
    std::fs::create_dir_all(&local).map_err(|e| {
        format!("All directories unwritable, local fallback also failed: {local:?} -> {e}")
    })?;
    Ok(local)
}

pub(crate) fn voice_previews_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = ensure_audio_dir(app)?;
    let dir = base.join("voice-previews");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create voice previews directory: {e}"))?;
    Ok(dir)
}

pub(crate) fn voice_samples_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = ensure_audio_dir(app)?;
    let dir = base.join("voice-samples");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create voice samples directory: {e}"))?;
    Ok(dir)
}

/// 把任意字符串转成安全的文件名（仅保留字母数字、`-`、`_`）。
pub(crate) fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_current_and_legacy_audio_dirs_only() {
        let current = PathBuf::from("/tmp/draft-whisper/current/audio");
        let legacy = PathBuf::from("/tmp/draft-whisper/legacy/audio");
        let allowed = vec![current.clone(), legacy.clone()];

        assert!(is_path_in_allowed_dirs(
            &current.join("projects/demo/audio.wav"),
            &allowed
        ));
        assert!(is_path_in_allowed_dirs(
            &legacy.join("projects/demo/audio.wav"),
            &allowed
        ));
        assert!(!is_path_in_allowed_dirs(
            &PathBuf::from("/tmp/draft-whisper/other/audio.wav"),
            &allowed
        ));
    }

    #[test]
    fn sanitizes_generated_file_names() {
        assert_eq!(sanitize_filename("001_你好/A"), "001____A");
        assert_eq!(sanitize_filename("safe-Name_42"), "safe-Name_42");
    }
}
