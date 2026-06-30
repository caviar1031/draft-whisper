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

        // ===== 垂直居中 Traffic Light 按钮 =====
        // Overlay 模式下 traffic light 的原始 superview 是一个小的标题栏容器，
        // 直接设置 frameOrigin 会因坐标系不匹配而把按钮移出可视区域。
        // 正确做法：先 removeFromSuperview → addSubview 到 contentView，
        // 然后用 contentView 坐标系定位。
        // NSWindowButton 枚举值: Close=0, Miniaturize=1, Zoom=2
        unsafe {
          use objc::msg_send;
          use objc::sel;
          use objc::sel_impl;
          use objc::runtime::Object;

          #[repr(C)]
          struct NSPoint {
            x: f64,
            y: f64,
          }
          #[repr(C)]
          struct NSSize {
            width: f64,
            height: f64,
          }
          #[repr(C)]
          struct NSRect {
            origin: NSPoint,
            size: NSSize,
          }

          // 从 contentView 获取 ns_window（与 tts.rs 拖拽代码一致）
          let content_view = window.ns_view().unwrap() as *mut Object;
          let ns_window: *mut Object = msg_send![content_view, window];

          let button_ids: [u64; 3] = [0, 1, 2]; // Close, Miniaturize, Zoom
          let title_bar_height: f64 = 38.0;
          let button_height: f64 = 14.0;

          // contentView 坐标系原点在左下角，bounds.height = 窗口高度
          let cv_bounds: NSRect = msg_send![content_view, bounds];
          let cv_height = cv_bounds.size.height;
          // 标题栏占据 contentView 顶部 38px → y: [cv_height-38, cv_height]
          // 居中：按钮底边 = cv_height - 38 + (38-14)/2 = cv_height - 26
          let centered_y = cv_height - title_bar_height + (title_bar_height - button_height) / 2.0;

          for &btn_id in &button_ids {
            let btn: *mut Object = msg_send![ns_window, standardWindowButton: btn_id];
            if btn.is_null() {
              continue;
            }
            // 移出原始 superview，加入 contentView
            let _: () = msg_send![btn, removeFromSuperview];
            let _: () = msg_send![content_view, addSubview: btn];

            let frame: NSRect = msg_send![btn, frame];
            let new_origin = NSPoint {
              x: frame.origin.x,
              y: centered_y,
            };
            let _: () = msg_send![btn, setFrameOrigin: new_origin];
          }
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
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
