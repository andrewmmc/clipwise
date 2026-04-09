use std::sync::{Arc, Mutex};

// ── Shared state ──────────────────────────────────────────────────────────────

struct ServiceStateInner {
    pending_text: Mutex<Option<String>>,
    source_pid: Mutex<Option<i32>>,
}

/// Tauri-managed state for the macOS Services integration.
///
/// Wraps an Arc so it can be cheaply cloned — one copy lives in Tauri's state
/// manager (accessible to commands via `State<'_, ServiceState>`) and another
/// is stored in the macOS module's global so the ObjC callback can reach it.
#[derive(Clone)]
pub struct ServiceState(Arc<ServiceStateInner>);

impl ServiceState {
    pub fn new() -> Self {
        Self(Arc::new(ServiceStateInner {
            pending_text: Mutex::new(None),
            source_pid: Mutex::new(None),
        }))
    }

    /// Store text + source PID written by the ObjC handler.
    pub fn set_pending(&self, text: String, pid: i32) {
        *self.0.pending_text.lock().unwrap() = Some(text);
        *self.0.source_pid.lock().unwrap() = Some(pid);
    }

    /// Take the pending text out of state (clears it).
    pub fn take_pending_text(&self) -> Option<String> {
        self.0.pending_text.lock().unwrap().take()
    }

    pub fn get_source_pid(&self) -> Option<i32> {
        *self.0.source_pid.lock().unwrap()
    }
}

// ── macOS implementation ──────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod macos {
    use super::ServiceState;
    use crate::error::AppError;
    use objc2::define_class;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::ClassType;
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationOptions, NSPasteboard, NSPasteboardTypeString,
        NSRunningApplication, NSWorkspace,
    };
    use objc2_foundation::{MainThreadMarker, NSObject, NSString};
    use std::sync::OnceLock;

    // Globals set once during app setup.
    static SERVICE_STATE: OnceLock<ServiceState> = OnceLock::new();
    static SHOW_PICKER: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

    pub fn init(state: ServiceState, show_picker: impl Fn() + Send + Sync + 'static) {
        SERVICE_STATE.set(state).ok();
        SHOW_PICKER.set(Box::new(show_picker)).ok();
    }

    // ── ObjC service-provider class ───────────────────────────────────────────

    define_class!(
        /// ObjC class that macOS calls when the user picks "LLM Actions/Transform Text"
        /// from the Services menu. No instance variables — all state lives in globals.
        #[unsafe(super(NSObject))]
        #[name = "LLMActionsServiceProvider"]
        struct ServiceProvider;

        impl ServiceProvider {
            // Selector: - (void)transformText:(NSPasteboard*)pb
            //                       userData:(NSString*)ud
            //                          error:(NSString**)err
            #[unsafe(method(transformText:userData:error:))]
            fn transform_text(
                &self,
                pasteboard: &NSPasteboard,
                _user_data: Option<&NSString>,
                _error: *mut *mut NSString,
            ) {
                // Read the selected text from the passed-in pasteboard.
                let text: Option<String> = unsafe {
                    pasteboard
                        .stringForType(NSPasteboardTypeString)
                        .map(|s| s.to_string())
                };

                let text = match text {
                    Some(t) if !t.is_empty() => t,
                    _ => return,
                };

                // Record which app was frontmost so we can re-activate it later.
                let source_pid: i32 = {
                    let ws = NSWorkspace::sharedWorkspace();
                    ws.frontmostApplication()
                        .map(|a| a.processIdentifier())
                        .unwrap_or(0)
                };

                if let Some(state) = SERVICE_STATE.get() {
                    state.set_pending(text, source_pid);
                }
                if let Some(show) = SHOW_PICKER.get() {
                    show();
                }
            }
        }
    );

    impl ServiceProvider {
        fn new() -> Retained<Self> {
            unsafe { objc2::msg_send![Self::class(), new] }
        }
    }

    // ── Public helpers ────────────────────────────────────────────────────────

    pub fn register_service_provider() {
        unsafe {
            let mtm = MainThreadMarker::new_unchecked();
            let provider = ServiceProvider::new();
            // Leak the Retained so the object lives for the process lifetime.
            let raw = Retained::into_raw(provider) as *mut AnyObject;
            let app = NSApplication::sharedApplication(mtm);
            app.setServicesProvider(Some(&*raw));
        }
    }

    /// Check whether this process has been granted Accessibility permission.
    /// Required for CGEvent-based Cmd+V simulation.
    pub fn is_accessibility_trusted() -> bool {
        #[link(name = "ApplicationServices", kind = "framework")]
        unsafe extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }
        unsafe { AXIsProcessTrusted() }
    }

    /// Prompt the user to grant Accessibility permission if not already granted.
    /// Shows the system dialog. Returns true if trusted, false otherwise.
    pub fn request_accessibility_permission() -> bool {
        #[link(name = "ApplicationServices", kind = "framework")]
        unsafe extern "C" {
            fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
        }

        unsafe {
            // According to Apple's docs, passing NULL prompts the user if not trusted
            AXIsProcessTrustedWithOptions(std::ptr::null())
        }
    }

    /// Re-activate the source app, write `text` to the general clipboard, then
    /// send Cmd+V via CGEvent so the text is pasted in place.
    pub async fn paste_result(text: String, source_pid: i32) -> Result<(), AppError> {
        // Raw CGEvent bindings (CoreGraphics.framework, available on all macOS).
        #[link(name = "CoreGraphics", kind = "framework")]
        unsafe extern "C" {
            fn CGEventSourceCreate(state_id: i32) -> *mut std::ffi::c_void;
            fn CGEventCreateKeyboardEvent(
                source: *mut std::ffi::c_void,
                virtual_key: u16,
                key_down: bool,
            ) -> *mut std::ffi::c_void;
            fn CGEventSetFlags(event: *mut std::ffi::c_void, flags: u64);
            fn CGEventPost(tap: i32, event: *mut std::ffi::c_void);
            fn CFRelease(cf: *const std::ffi::c_void);
        }
        const KCG_HID_EVENT_TAP: i32 = 0;
        const KCG_EVENT_FLAG_MASK_COMMAND: u64 = 0x0010_0000;
        const KCG_EVENT_SOURCE_STATE_HID: i32 = 1;
        const KVK_ANSI_V: u16 = 0x09;

        // Bring the originating app back to the front.
        if source_pid > 0 {
            #[allow(deprecated)]
            if let Some(a) =
                NSRunningApplication::runningApplicationWithProcessIdentifier(source_pid)
            {
                a.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        // Write the result onto the general clipboard.
        unsafe {
            let pb = NSPasteboard::generalPasteboard();
            pb.clearContents();
            let ns_text = NSString::from_str(&text);
            pb.setString_forType(&ns_text, NSPasteboardTypeString);
        }

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        // Simulate Cmd+V.
        unsafe {
            let source = CGEventSourceCreate(KCG_EVENT_SOURCE_STATE_HID);
            if source.is_null() {
                return Err(AppError::Service("CGEventSource creation failed".into()));
            }
            let down = CGEventCreateKeyboardEvent(source, KVK_ANSI_V, true);
            CGEventSetFlags(down, KCG_EVENT_FLAG_MASK_COMMAND);
            CGEventPost(KCG_HID_EVENT_TAP, down);
            CFRelease(down);

            let up = CGEventCreateKeyboardEvent(source, KVK_ANSI_V, false);
            CGEventSetFlags(up, KCG_EVENT_FLAG_MASK_COMMAND);
            CGEventPost(KCG_HID_EVENT_TAP, up);
            CFRelease(up);
            CFRelease(source);
        }

        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub use macos::{init, is_accessibility_trusted, paste_result, register_service_provider, request_accessibility_permission};
