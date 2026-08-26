#[cfg(target_os = "macos")]
pub(crate) mod macos;

#[cfg(target_os = "windows")]
pub(crate) mod windows;

use tauri::AppHandle;

use crate::audio::storage::is_in_audio_dir;

/// 将音频文件复制到系统剪贴板（文件引用，非文本）。
///
/// macOS 使用 AppleScript 的文件引用，Windows 使用原生 `CF_HDROP` 文件列表。
#[tauri::command]
pub fn tts_copy_to_clipboard(
    path: String,
    _window: tauri::Window,
    app: AppHandle,
) -> Result<(), String> {
    let safe_path = is_in_audio_dir(&app, &path)?;

    #[cfg(target_os = "macos")]
    {
        macos::copy_file_to_clipboard(&safe_path)
    }

    #[cfg(target_os = "windows")]
    {
        let hwnd = _window
            .hwnd()
            .map_err(|error| format!("Failed to get Windows clipboard owner window: {error}"))?;
        windows::copy_file_to_clipboard(&safe_path, hwnd)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = safe_path;
        Err("File copy to clipboard is only supported on macOS and Windows".into())
    }
}

/// 在系统文件管理器中显示并选中音频文件。
///
/// macOS 使用 `open -R <path>`，Windows 使用 Explorer 的 `/select,` 参数。
#[tauri::command]
pub fn tts_show_in_finder(path: String, app: AppHandle) -> Result<(), String> {
    let safe_path = is_in_audio_dir(&app, &path)?;

    #[cfg(target_os = "macos")]
    {
        macos::reveal_in_finder(&safe_path)
    }

    #[cfg(target_os = "windows")]
    {
        windows::reveal_in_explorer(&safe_path)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = safe_path;
        Err("Show in file manager is only supported on macOS and Windows".into())
    }
}

/// 发起平台原生文件拖拽，将音频文件拖入剪映/Premiere 等剪辑软件。
#[tauri::command]
pub fn tts_drag_file(path: String, window: tauri::Window, app: AppHandle) -> Result<(), String> {
    let safe_path = is_in_audio_dir(&app, &path)?;

    #[cfg(target_os = "macos")]
    {
        macos::begin_drag(&safe_path, &window)
    }

    #[cfg(target_os = "windows")]
    {
        let _ = window;
        windows::begin_drag(&safe_path)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (window, safe_path);
        Err("Native file drag is only supported on macOS and Windows".into())
    }
}
