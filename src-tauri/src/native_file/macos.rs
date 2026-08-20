use std::path::Path;

pub(crate) fn copy_file_to_clipboard(path: &Path) -> Result<(), String> {
    // 先转义反斜杠，再转义双引号（顺序不能反）
    let escaped = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    let script = format!("set the clipboard to (POSIX file \"{}\")", escaped);
    let output = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("Failed to execute osascript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to copy to clipboard: {stderr}"));
    }

    Ok(())
}

pub(crate) fn reveal_in_finder(path: &Path) -> Result<(), String> {
    let safe_path_str = path.to_string_lossy().to_string();
    std::process::Command::new("open")
        .args(["-R", &safe_path_str])
        .spawn()
        .map_err(|e| format!("Failed to open Finder: {e}"))?;

    Ok(())
}

pub(crate) fn begin_drag(path: &Path, window: &tauri::Window) -> Result<(), String> {
    let safe_path_str = path.to_string_lossy().to_string();

    let mtm = objc2_foundation::MainThreadMarker::new()
        .ok_or_else(|| "Native file drag must be initiated on the main thread".to_string())?;

    let ns_view_ptr = window
        .ns_view()
        .map_err(|e| format!("Failed to get ns_view: {e}"))?;
    if ns_view_ptr.is_null() {
        return Err("NSView pointer is null".into());
    }

    // SAFETY:
    // - `ns_view_ptr` 由 Tauri 返回，指向当前窗口 content view 的有效 NSView 实例。
    // - 上面已通过 `MainThreadMarker::new()` 确认调用发生在主线程，满足
    //   NSView / NSWindow / NSDraggingSession 的 MainThreadOnly 约束。
    // - 调用期间 window / view 由 Tauri 持有，不会被释放。
    // - source 的生命周期由 `drag::begin_drag` 内部管理（见该函数注释）。
    unsafe { drag::begin_drag(ns_view_ptr, mtm, &safe_path_str) };

    log::info!("Native file drag started: {}", safe_path_str);
    Ok(())
}

/// macOS 原生文件拖拽实现细节。
///
/// 通过 `define_class!` 声明一个实现 `NSDraggingSource` 协议的 Objective-C 类
/// `DWFileDragSource`，替代旧版 `objc` crate 的 `ClassDecl` 动态注册。类注册由
/// `objc2` 在首次取用 `ClassType::class()` 时通过 `Once` 完成，天然线程安全，
/// 无需手动维护 `static mut` 与 `Once`。
///
/// ## Source 生命周期
///
/// `begin_drag` 通过 `Retained::into_raw` 显式保留 source 的 +1 引用计数，
/// 因而不依赖 AppKit 是否强持有 source。拖拽结束回调把这份 +1 所有权恢复为
/// `Retained`，再交给当前 Objective-C autorelease pool 延迟释放。这样对象在
/// `&self` 回调返回前不会析构，同时不会永久泄漏。
mod drag {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, NSObject, ProtocolObject};
    use objc2::{
        define_class, msg_send, AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly,
    };
    use objc2_app_kit::{
        NSDragOperation, NSDraggingContext, NSDraggingItem, NSDraggingSession, NSDraggingSource,
        NSEvent, NSEventModifierFlags, NSEventType, NSPasteboardWriting, NSView, NSWorkspace,
    };
    use objc2_foundation::{NSArray, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURL};
    use std::{cell::Cell, ffi::c_void};

    #[derive(Default)]
    struct DragSourceIvars {
        release_scheduled: Cell<bool>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "DWFileDragSource"]
        #[ivars = DragSourceIvars]
        struct DWFileDragSource;

        unsafe impl NSObjectProtocol for DWFileDragSource {}

        unsafe impl NSDraggingSource for DWFileDragSource {
            #[allow(non_snake_case)]
            #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
            fn draggingSession_sourceOperationMaskForDraggingContext(
                &self,
                _session: &NSDraggingSession,
                _context: NSDraggingContext,
            ) -> NSDragOperation {
                NSDragOperation::Copy
            }

            #[allow(non_snake_case)]
            #[unsafe(method(draggingSession:endedAtPoint:operation:))]
            fn draggingSession_endedAtPoint_operation(
                &self,
                _session: &NSDraggingSession,
                _screen_point: NSPoint,
                _operation: NSDragOperation,
            ) {
                if self.ivars().release_scheduled.replace(true) {
                    return;
                }

                // SAFETY: `begin_drag` 对这个实例恰好调用了一次 `Retained::into_raw`，
                // 留下可被恢复的 +1 所有权；`release_scheduled` 保证该所有权只恢复一次。
                // `autorelease_ptr` 不会立即释放对象，而是在当前 autorelease pool 排空时
                // 释放，因此 `self` 在本回调剩余期间保持有效。
                let owned = unsafe { Retained::from_raw(self as *const Self as *mut Self) }
                    .expect("drag source self pointer must not be null");
                let _autoreleased_source = Retained::autorelease_ptr(owned);
            }
        }
    );

    impl DWFileDragSource {
        fn new(mtm: MainThreadMarker) -> Retained<Self> {
            let allocated = <Self as MainThreadOnly>::alloc(mtm);
            let partial = allocated.set_ivars(DragSourceIvars::default());
            // SAFETY: `partial` 是刚 alloc 且 ivar 已就绪的实例，调用 NSObject 的
            // `init` 是其指定初始化器；返回的 `Retained` 拥有 +1 引用计数，符合
            // init 家族语义。
            unsafe { msg_send![super(partial), init] }
        }
    }

    /// 从 NSView 启动一次携带文件 URL 的原生拖拽会话。
    ///
    /// # Safety
    ///
    /// - `ns_view_ptr` 必须指向有效的 `NSView` 实例。
    /// - 调用必须发生在主线程（由 `mtm` 证明）。
    /// - `path_str` 必须是已经过 `is_in_audio_dir` 校验的绝对路径。
    pub(super) unsafe fn begin_drag(
        ns_view_ptr: *mut c_void,
        mtm: MainThreadMarker,
        path_str: &str,
    ) {
        // SAFETY: 调用方承诺指针有效且当前在主线程（见函数级 SAFETY 注释）。
        let view: &NSView = unsafe { &*(ns_view_ptr as *const NSView) };

        // --- Drag source instance ---
        let source = DWFileDragSource::new(mtm);
        let source_ptr = Retained::into_raw(source);
        // SAFETY: `source_ptr` 来自非空的 `Retained`，上面的 +1 保证它在结束回调
        // 安排延迟释放前一直有效。
        let source = unsafe { &*source_ptr };
        let source_ref: &ProtocolObject<dyn NSDraggingSource> = ProtocolObject::from_ref(source);

        // --- File URL ---
        let path_nsstring = NSString::from_str(path_str);
        let file_url = NSURL::fileURLWithPath(&path_nsstring);

        // --- Audio file icon via NSWorkspace (public API) ---
        let workspace = NSWorkspace::sharedWorkspace();
        let ext_nsstring = NSString::from_str("wav");
        #[allow(deprecated)]
        let drag_image = workspace.iconForFileType(&ext_nsstring);

        // --- Mouse location (global, in screen coordinates) ---
        let mouse_loc = NSEvent::mouseLocation();

        // --- Window number (合成 NSLeftMouseDown 事件需要) ---
        let ns_window = view
            .window()
            .expect("drag source view must be installed in a window");
        let window_number = ns_window.windowNumber();

        // --- Synthesize mouse-down event ---
        let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
            NSEventType::LeftMouseDown,
            mouse_loc,
            NSEventModifierFlags::empty(),
            0.0,
            window_number,
            None,
            0,
            1,
            1.0,
        )
        .expect("failed to synthesize NSLeftMouseDown event for drag session");

        // --- NSDraggingItem with the file URL as pasteboard content ---
        let writer: &ProtocolObject<dyn NSPasteboardWriting> = ProtocolObject::from_ref(&*file_url);
        let allocated_item = <NSDraggingItem as AnyThread>::alloc();
        let item = NSDraggingItem::initWithPasteboardWriter(allocated_item, writer);

        // Set the drag image at mouse location (64×64 icon)
        let drag_frame = NSRect {
            origin: NSPoint {
                x: mouse_loc.x - 32.0,
                y: mouse_loc.y - 32.0,
            },
            size: NSSize {
                width: 64.0,
                height: 64.0,
            },
        };
        let contents: Retained<AnyObject> = drag_image.into();
        // SAFETY: `contents` 实际类型为 NSImage，与 setDraggingFrame:contents:
        // 文档约定一致（contents 应为 NSImage 或 NSDraggingImageComponent）。
        unsafe { item.setDraggingFrame_contents(drag_frame, Some(&contents)) };

        // --- NSArray with the dragging item ---
        let items = NSArray::from_slice(&[&*item]);

        // --- Begin native dragging session from the content view ---
        let _session = view.beginDraggingSessionWithItems_event_source(&items, &event, source_ref);
    }
}
