#[cfg(target_os = "macos")]
mod macos {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use objc2_foundation::NSString;

    pub fn read_clipboard_text() -> Option<String> {
        unsafe {
            NSPasteboard::generalPasteboard()
                .stringForType(NSPasteboardTypeString)
                .map(|s| s.to_string())
        }
    }

    pub fn write_clipboard_text(text: &str) {
        unsafe {
            let pb = NSPasteboard::generalPasteboard();
            pb.clearContents();
            let ns_text = NSString::from_str(text);
            pb.setString_forType(&ns_text, NSPasteboardTypeString);
        }
    }
}

#[cfg(target_os = "macos")]
pub use macos::{read_clipboard_text, write_clipboard_text};

#[cfg(not(target_os = "macos"))]
pub fn read_clipboard_text() -> Option<String> {
    None
}

#[cfg(not(target_os = "macos"))]
pub fn write_clipboard_text(_text: &str) {}
