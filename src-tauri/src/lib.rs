mod tts;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
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
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
