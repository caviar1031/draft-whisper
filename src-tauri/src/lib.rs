mod tts;
use tauri::Manager;

#[cfg(target_os = "macos")]
use objc2_app_kit::NSWindow;
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
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
        //
        // 直接复用 Tauri 暴露的 NSWindow 指针，避免旧版 `objc` 宏的 cfg 警告。
        let ns_window_ptr = window
          .ns_window()
          .expect("Failed to get NSWindow pointer for setup");
        // SAFETY:
        // - `ns_window_ptr` 由 Tauri 返回，指向当前窗口的有效 NSWindow 实例，
        //   且在 setup 阶段窗口已经创建并完成布局。
        // - 调用发生在应用 `setup` 回调中（主线程），满足 NSWindow / AppKit 的
        //   MainThreadOnly 约束。
        // - `setTitlebarAppearsTransparent:` 是 NSWindow 的属性 setter，不会并发
        //   修改窗口结构或触发重入，调用期间窗口对象不会被释放。
        let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };
        ns_window.setTitlebarAppearsTransparent(true);
      }

      #[cfg(debug_assertions)]
      {
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
      tts::tts_preview_voice_clone,
      tts::tts_preview_voice,
      tts::tts_test,
      tts::tts_read_audio,
      tts::tts_delete_audio_files,
      tts::tts_copy_to_clipboard,
      tts::tts_show_in_finder,
      tts::tts_drag_file,
      tts::tts_list_projects,
      tts::tts_create_project,
      tts::tts_delete_project,
      tts::save_voice_sample,
      tts::delete_voice_sample,
      tts::save_api_key,
      tts::load_api_key,
      tts::delete_api_key,
      tts::migrate_legacy_api_key,
    ])
    .build(tauri::generate_context!())
    .expect("error while running tauri application");

  app.run(|app_handle, event| {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Reopen {
      has_visible_windows: false,
      ..
    } = event
    {
      if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }
  });
}
