mod tts;
use tauri::Manager;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // ===== macOS 动态毛玻璃 (Vibrancy) =====
      // UnderWindowBackground: 透出桌面壁纸 + 后台窗口，最接近 Liquid Glass 质感
      #[cfg(target_os = "macos")]
      if let Some(window) = app.get_webview_window("main") {
        apply_vibrancy(
          &window,
          NSVisualEffectMaterial::UnderWindowBackground,
          None,
          Some(16.0),
        )
        .expect("apply_vibrancy 仅支持 macOS");
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        // dev 模式自动打开 DevTools，方便 console 调试 invoke
        if let Some(window) = app.get_webview_window("main") {
          window.open_devtools();
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      tts::tts_generate,
      tts::tts_test,
      tts::tts_read_audio,
      tts::tts_copy_to_clipboard,
      tts::tts_show_in_finder,
      tts::tts_drag_file,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
