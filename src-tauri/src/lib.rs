mod tts;
use tauri::Manager;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
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

        // ===== macOS Traffic Light 按钮居中 =====
        // titleBarStyle=Overlay 下标题栏叠在 webview 之上。
        // 设置 titlebarAppearsTransparent 让标题栏透明，
        // traffic light 按钮保持在标准标题栏容器中（不移动到 contentView），
        // 窗口缩放时由 NSWindow 自动管理按钮位置。
        unsafe {
          use objc::msg_send;
          use objc::sel;
          use objc::sel_impl;
          use objc::runtime::Object;

          let content_view = window.ns_view().unwrap() as *mut Object;
          let ns_window: *mut Object = msg_send![content_view, window];
          let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: true];
        }
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
      tts::tts_list_models,
      tts::tts_read_audio,
      tts::tts_copy_to_clipboard,
      tts::tts_show_in_finder,
      tts::tts_drag_file,
      tts::tts_list_projects,
      tts::tts_create_project,
      tts::save_voice_sample,
      tts::delete_voice_sample,
      tts::save_api_key,
      tts::load_api_key,
      tts::delete_api_key,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
