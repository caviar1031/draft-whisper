#[cfg(target_os = "windows")]
use std::path::Path;

#[cfg(target_os = "windows")]
use std::{ffi::OsString, os::windows::ffi::OsStrExt, os::windows::ffi::OsStringExt};

#[cfg(target_os = "windows")]
use windows::{
    core::{implement, Interface, BOOL, PCWSTR},
    Win32::{
        Foundation::{
            COLORREF, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, HANDLE,
            HGLOBAL, POINT, SIZE, S_OK,
        },
        Graphics::Gdi::{DeleteObject, CLR_INVALID, HBITMAP, HGDIOBJ},
        System::{
            Com::{CoCreateInstance, IDataObject, CLSCTX_INPROC_SERVER},
            DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT},
            Ole::{
                DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, OleUninitialize,
                CF_HDROP, DROPEFFECT, DROPEFFECT_COPY,
            },
            SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS},
        },
        UI::Shell::{
            BHID_DataObject, CLSID_DragDropHelper, IDragSourceHelper, IShellItem,
            IShellItemImageFactory, SHCreateItemFromParsingName, DROPFILES, SHDRAGIMAGE,
            SIIGBF_ICONONLY, SIIGBF_INCACHEONLY,
        },
    },
};
#[cfg(target_os = "windows")]
use windows_core::Free;

#[cfg(target_os = "windows")]
struct OleApartment;

#[cfg(target_os = "windows")]
impl OleApartment {
    fn initialize() -> Result<Self, String> {
        unsafe { OleInitialize(None) }
            .map_err(|error| format!("Failed to initialize Windows OLE drag support: {error}"))?;
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for OleApartment {
    fn drop(&mut self) {
        unsafe { OleUninitialize() };
    }
}

#[cfg(target_os = "windows")]
struct ClipboardGuard;

#[cfg(target_os = "windows")]
impl ClipboardGuard {
    fn open(owner: windows::Win32::Foundation::HWND) -> Result<Self, String> {
        let mut last_error = String::new();
        for _ in 0..10 {
            match unsafe { OpenClipboard(Some(owner)) } {
                Ok(()) => return Ok(Self),
                Err(error) => {
                    last_error = error.to_string();
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
            }
        }
        Err(format!("Failed to open Windows clipboard: {last_error}"))
    }
}

#[cfg(target_os = "windows")]
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

#[cfg(target_os = "windows")]
struct OwnedGlobalMemory(Option<HGLOBAL>);

#[cfg(target_os = "windows")]
impl Drop for OwnedGlobalMemory {
    fn drop(&mut self) {
        if let Some(mut memory) = self.0.take() {
            unsafe { memory.free() };
        }
    }
}

#[cfg(target_os = "windows")]
fn clipboard_file_list(path: &Path) -> Vec<u16> {
    let mut file_list = shell_parsing_name(path);
    file_list.push(0);
    file_list
}

#[cfg(target_os = "windows")]
pub(crate) fn copy_file_to_clipboard(
    path: &Path,
    owner: windows::Win32::Foundation::HWND,
) -> Result<(), String> {
    let file_list = clipboard_file_list(path);
    let header = DROPFILES {
        pFiles: std::mem::size_of::<DROPFILES>() as u32,
        pt: POINT::default(),
        fNC: BOOL(0),
        fWide: BOOL(1),
    };
    let header_size = std::mem::size_of::<DROPFILES>();
    let file_list_size = file_list.len() * std::mem::size_of::<u16>();
    let allocation_size = header_size + file_list_size;

    let global = unsafe { GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, allocation_size) }
        .map_err(|error| format!("Failed to allocate Windows clipboard data: {error}"))?;
    let mut memory = OwnedGlobalMemory(Some(global));
    let destination = unsafe { GlobalLock(global) };
    if destination.is_null() {
        return Err("Failed to lock Windows clipboard data".into());
    }
    unsafe {
        std::ptr::copy_nonoverlapping(
            (&header as *const DROPFILES).cast::<u8>(),
            destination.cast::<u8>(),
            header_size,
        );
        std::ptr::copy_nonoverlapping(
            file_list.as_ptr().cast::<u8>(),
            destination.cast::<u8>().add(header_size),
            file_list_size,
        );
        let _ = GlobalUnlock(global);
    }

    let _clipboard = ClipboardGuard::open(owner)?;
    unsafe { EmptyClipboard() }
        .map_err(|error| format!("Failed to clear Windows clipboard: {error}"))?;
    unsafe { SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(global.0))) }
        .map_err(|error| format!("Failed to copy audio file to Windows clipboard: {error}"))?;
    memory.0.take();
    Ok(())
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DragDecision {
    Continue,
    Drop,
    Cancel,
}

#[cfg(target_os = "windows")]
fn drag_decision(escape_pressed: bool, key_state: MODIFIERKEYS_FLAGS) -> DragDecision {
    if escape_pressed {
        DragDecision::Cancel
    } else if !key_state.contains(MK_LBUTTON) {
        DragDecision::Drop
    } else {
        DragDecision::Continue
    }
}

#[cfg(target_os = "windows")]
#[implement(IDropSource)]
struct FileDropSource;

#[cfg(target_os = "windows")]
impl IDropSource_Impl for FileDropSource_Impl {
    fn QueryContinueDrag(
        &self,
        escape_pressed: BOOL,
        key_state: MODIFIERKEYS_FLAGS,
    ) -> windows::core::HRESULT {
        match drag_decision(escape_pressed.as_bool(), key_state) {
            DragDecision::Continue => S_OK,
            DragDecision::Drop => DRAGDROP_S_DROP,
            DragDecision::Cancel => DRAGDROP_S_CANCEL,
        }
    }

    fn GiveFeedback(&self, _effect: DROPEFFECT) -> windows::core::HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}

#[cfg(target_os = "windows")]
struct DragImage {
    bitmap: HBITMAP,
    _helper: IDragSourceHelper,
}

#[cfg(target_os = "windows")]
impl Drop for DragImage {
    fn drop(&mut self) {
        let _ = unsafe { DeleteObject(HGDIOBJ(self.bitmap.0)) };
    }
}

#[cfg(target_os = "windows")]
fn attach_cached_drag_image(
    shell_item: &IShellItem,
    data_object: &IDataObject,
) -> Option<DragImage> {
    let image_factory: IShellItemImageFactory = shell_item.cast().ok()?;

    let bitmap = unsafe {
        image_factory
            .GetImage(
                SIZE { cx: 48, cy: 48 },
                SIIGBF_ICONONLY | SIIGBF_INCACHEONLY,
            )
            .ok()?
    };

    let helper: IDragSourceHelper =
        unsafe { CoCreateInstance(&CLSID_DragDropHelper, None, CLSCTX_INPROC_SERVER) }.ok()?;
    let drag_image = SHDRAGIMAGE {
        sizeDragImage: SIZE { cx: 48, cy: 48 },
        ptOffset: POINT { x: 12, y: 12 },
        hbmpDragImage: bitmap,
        crColorKey: COLORREF(CLR_INVALID),
    };

    if unsafe { helper.InitializeFromBitmap(&drag_image, data_object) }.is_err() {
        let _ = unsafe { DeleteObject(HGDIOBJ(bitmap.0)) };
        return None;
    }

    Some(DragImage {
        bitmap,
        _helper: helper,
    })
}

#[cfg(target_os = "windows")]
fn shell_parsing_name(path: &Path) -> Vec<u16> {
    let path_wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    let extended_prefix = [b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16];
    let extended_unc_prefix = [
        b'\\' as u16,
        b'\\' as u16,
        b'?' as u16,
        b'\\' as u16,
        b'U' as u16,
        b'N' as u16,
        b'C' as u16,
        b'\\' as u16,
    ];

    let mut parsing_name = if path_wide.starts_with(&extended_unc_prefix) {
        let mut unc = vec![b'\\' as u16, b'\\' as u16];
        unc.extend_from_slice(&path_wide[extended_unc_prefix.len()..]);
        unc
    } else if path_wide.starts_with(&extended_prefix) {
        path_wide[extended_prefix.len()..].to_vec()
    } else {
        path_wide
    };
    parsing_name.push(0);
    parsing_name
}

#[cfg(target_os = "windows")]
fn explorer_select_argument(path: &Path) -> OsString {
    let parsing_name = shell_parsing_name(path);
    let shell_path = OsString::from_wide(&parsing_name[..parsing_name.len() - 1]);
    let mut select_argument = OsString::from("/select,");
    select_argument.push(shell_path);
    select_argument
}

#[cfg(target_os = "windows")]
pub(crate) fn reveal_in_explorer(path: &Path) -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg(explorer_select_argument(path))
        .spawn()
        .map_err(|error| format!("Failed to open Windows File Explorer: {error}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn create_shell_drag_data(path: &Path) -> Result<(IShellItem, IDataObject), String> {
    let wide_path = shell_parsing_name(path);
    let shell_item: IShellItem =
        unsafe { SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None) }
            .map_err(|error| format!("Failed to create a Windows Shell item: {error}"))?;
    let data_object: IDataObject = unsafe { shell_item.BindToHandler(None, &BHID_DataObject) }
        .map_err(|error| format!("Failed to create a Windows file drag object: {error}"))?;
    Ok((shell_item, data_object))
}

#[cfg(target_os = "windows")]
pub(crate) fn begin_drag(path: &Path) -> Result<(), String> {
    let _ole = OleApartment::initialize()?;
    let (shell_item, data_object) = create_shell_drag_data(path)?;
    let source: IDropSource = FileDropSource.into();
    let _drag_image = attach_cached_drag_image(&shell_item, &data_object);
    let mut effect = DROPEFFECT::default();

    let result = unsafe { DoDragDrop(&data_object, &source, DROPEFFECT_COPY, &mut effect) };

    if result == DRAGDROP_S_DROP || result == DRAGDROP_S_CANCEL {
        Ok(())
    } else {
        result
            .ok()
            .map_err(|error| format!("Windows native file drag failed: {error}"))
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use std::path::Path;

    use super::{
        clipboard_file_list, create_shell_drag_data, drag_decision, explorer_select_argument,
        shell_parsing_name, DragDecision, OleApartment,
    };
    use windows::Win32::System::{
        Com::{DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL},
        Ole::CF_HDROP,
        SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS},
    };

    #[test]
    fn escape_cancels_drag() {
        assert_eq!(drag_decision(true, MK_LBUTTON), DragDecision::Cancel);
    }

    #[test]
    fn releasing_left_button_drops_file() {
        assert_eq!(
            drag_decision(false, MODIFIERKEYS_FLAGS::default()),
            DragDecision::Drop
        );
    }

    #[test]
    fn holding_left_button_continues_drag() {
        assert_eq!(drag_decision(false, MK_LBUTTON), DragDecision::Continue);
    }

    #[test]
    fn converts_extended_paths_to_shell_parsing_names() {
        let drive = shell_parsing_name(Path::new(r"\\?\C:\Audio\clip.wav"));
        let unc = shell_parsing_name(Path::new(r"\\?\UNC\server\share\clip.wav"));
        assert_eq!(
            String::from_utf16_lossy(&drive[..drive.len() - 1]),
            r"C:\Audio\clip.wav"
        );
        assert_eq!(
            String::from_utf16_lossy(&unc[..unc.len() - 1]),
            r"\\server\share\clip.wav"
        );
    }

    #[test]
    fn builds_explorer_select_argument_from_extended_path() {
        assert_eq!(
            explorer_select_argument(Path::new(r"\\?\C:\Audio Files\clip.wav")).to_string_lossy(),
            r"/select,C:\Audio Files\clip.wav"
        );
    }

    #[test]
    fn builds_double_null_terminated_clipboard_file_list() {
        let file_list = clipboard_file_list(Path::new(r"\\?\C:\Audio Files\clip.wav"));
        assert_eq!(&file_list[file_list.len() - 2..], &[0, 0]);
        assert_eq!(
            String::from_utf16_lossy(&file_list[..file_list.len() - 2]),
            r"C:\Audio Files\clip.wav"
        );
    }

    #[test]
    fn shell_drag_object_exposes_existing_file_drop_format() {
        let _ole = OleApartment::initialize().expect("failed to initialize OLE for the test");
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("Cargo.toml")
            .canonicalize()
            .expect("failed to canonicalize the Shell test file");
        let (_, data_object) =
            create_shell_drag_data(&path).expect("failed to create Shell drag data");
        let format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };

        assert!(unsafe { data_object.QueryGetData(&format) }.is_ok());
    }
}
