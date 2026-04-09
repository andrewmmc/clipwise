import Foundation
import AppKit
import Carbon

/// Manages macOS Services registration and text replacement for LLM Actions.
///
/// This handler bridges the macOS Services menu (right-click context menu)
/// with the Tauri Rust backend. Each user-defined action appears as a
/// separate item in the Services submenu.
@objc public class LLMActionsServiceHandler: NSObject {

    // MARK: - Singleton
    public static let shared = LLMActionsServiceHandler()

    /// Callback invoked when a service is triggered. The closure receives
    /// (actionId: String, selectedText: String) and returns the transformed
    /// text, or nil if the action failed (in which case text is NOT replaced).
    public var actionCallback: ((String, String) async -> String?)?

    private override init() {
        super.init()
    }

    // MARK: - Service Registration

    /// Registers NSServices for all provided action IDs/names.
    /// Call this on app launch and after config changes.
    public func registerServices(actions: [(id: String, name: String)]) {
        // Build the NSServices array for Info.plist injection
        var services: [[String: Any]] = []

        for action in actions {
            let service: [String: Any] = [
                "NSMenuItem": ["default": "LLM Actions/\(action.name)"],
                "NSMessage": "handleService_\(action.id)",
                "NSSendTypes": ["NSStringPboardType", "public.utf8-plain-text"],
                "NSReturnTypes": ["NSStringPboardType", "public.utf8-plain-text"],
                "NSKeyEquivalent": [:]
            ]
            services.append(service)
        }

        // Update the app's Info.plist NSServices key at runtime
        // Note: This requires re-launch or NSUpdateDynamicServices call
        if let bundleInfoURL = Bundle.main.url(forResource: "Info", withExtension: "plist"),
           var infoDict = NSMutableDictionary(contentsOf: bundleInfoURL) as? [String: Any] {
            infoDict["NSServices"] = services
            (infoDict as NSDictionary).write(to: bundleInfoURL, atomically: true)
        }

        // Notify macOS to refresh the Services menu
        NSUpdateDynamicServices()
    }

    // MARK: - Service Handler (called by macOS via performSelector)

    /// Generic service handler — macOS calls this via the NSMessage selector.
    /// The action ID is embedded in the selector name after "handleService_".
    @objc public func handleService(_ pboard: NSPasteboard, userData: String, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        handleServiceInternal(pboard: pboard, actionId: userData)
    }

    /// Handles a service invocation for a specific action ID.
    public func handleServiceInternal(pboard: NSPasteboard, actionId: String) {
        guard let text = pboard.string(forType: .string) ?? pboard.string(forType: NSPasteboard.PasteboardType("public.utf8-plain-text")) else {
            return
        }

        guard let callback = actionCallback else { return }

        Task {
            guard let result = await callback(actionId, text) else {
                // Action failed — do nothing, leave original text intact
                return
            }
            await MainActor.run {
                self.replaceText(result)
            }
        }
    }

    // MARK: - Text Replacement

    /// Writes text to the general pasteboard and simulates Cmd+V to paste.
    private func replaceText(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        // Simulate Cmd+V using CGEvent
        let source = CGEventSource(stateID: .hidSystemState)

        // Key down
        if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 0x09 /* V */, keyDown: true) {
            keyDown.flags = .maskCommand
            keyDown.post(tap: .cghidEventTap)
        }

        // Key up
        if let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 0x09 /* V */, keyDown: false) {
            keyUp.flags = .maskCommand
            keyUp.post(tap: .cghidEventTap)
        }
    }

    // MARK: - Permission Check

    /// Returns true if the app has Accessibility permission (needed for CGEvent paste).
    public func hasAccessibilityPermission() -> Bool {
        return AXIsProcessTrusted()
    }

    /// Prompts the user to grant Accessibility permission.
    public func requestAccessibilityPermission() {
        let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: true]
        AXIsProcessTrustedWithOptions(options)
    }
}
