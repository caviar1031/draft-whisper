use std::path::PathBuf;
use tauri::AppHandle;

use crate::audio::storage::ensure_audio_dir;

/// 获取项目根目录：`{audio_cache_dir}/projects/`。
pub(crate) fn projects_root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = ensure_audio_dir(app)?;
    let root = base.join("projects");
    std::fs::create_dir_all(&root).map_err(|e| format!("Failed to create projects root: {e}"))?;
    Ok(root)
}

pub(crate) fn validate_project_name(name: &str) -> Result<&str, String> {
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

    #[cfg(target_os = "windows")]
    validate_windows_project_name(trimmed)?;

    Ok(trimmed)
}

#[cfg(target_os = "windows")]
pub(crate) fn validate_windows_project_name(name: &str) -> Result<(), String> {
    if name.ends_with('.')
        || name.chars().any(|character| {
            character <= '\u{1f}' || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
        })
    {
        return Err("Project name contains characters that are not allowed on Windows".into());
    }

    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let is_reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"))
            .is_some_and(|number| {
                matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            });
    if is_reserved {
        return Err("Project name is reserved by Windows".into());
    }

    Ok(())
}

pub(crate) fn project_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let validated = validate_project_name(name)?;
    Ok(projects_root(app)?.join(validated))
}

/// 列出所有已有项目名称。
#[tauri::command]
pub fn tts_list_projects(app: AppHandle) -> Result<Vec<String>, String> {
    let root = projects_root(&app)?;
    let mut names: Vec<String> = Vec::new();
    for entry in
        std::fs::read_dir(&root).map_err(|e| format!("Failed to read projects directory: {e}"))?
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
#[tauri::command]
pub fn tts_create_project(name: String, app: AppHandle) -> Result<Vec<String>, String> {
    let trimmed = validate_project_name(&name)?.to_string();
    let dir = project_dir(&app, &trimmed)?;
    if dir.exists() {
        return Err(format!("Project \"{trimmed}\" already exists"));
    }
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create project directory: {e}"))?;
    log::info!("Created project: {}", dir.display());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_project_names() {
        for invalid in [
            "",
            " ",
            ".hidden",
            "..",
            "../escape",
            "nested/name",
            "nested\\name",
        ] {
            assert!(
                validate_project_name(invalid).is_err(),
                "accepted {invalid:?}"
            );
        }
        assert_eq!(
            validate_project_name(" Demo Project ").unwrap(),
            "Demo Project"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn rejects_windows_reserved_project_names() {
        for invalid in [
            "bad:name",
            "bad*name",
            "bad?name",
            "bad\"name",
            "bad<name",
            "bad>name",
            "bad|name",
            "trailing.",
            "CON",
            "con.txt",
            "NUL",
            "COM1",
            "lpt9.project",
        ] {
            assert!(
                validate_project_name(invalid).is_err(),
                "accepted {invalid:?}"
            );
        }
        assert_eq!(
            validate_project_name("Windows Project").unwrap(),
            "Windows Project"
        );
    }
}
