use crate::models::AppLanguage;

pub(crate) struct TrayMessages {
    pub no_actions: &'static str,
    pub open_clipwise: &'static str,
    pub quit_clipwise: &'static str,
    pub already_running: &'static str,
    pub empty_clipboard: &'static str,
    pub action_not_found: &'static str,
}

pub(crate) fn tray_messages(language: AppLanguage) -> TrayMessages {
    match language {
        AppLanguage::English => TrayMessages {
            no_actions: "(No custom actions)",
            open_clipwise: "Open Clipwise...",
            quit_clipwise: "Quit Clipwise",
            already_running: "Another transformation is already in progress.",
            empty_clipboard: "Clipboard does not contain any text to transform.",
            action_not_found: "That action could not be found.",
        },
        AppLanguage::TraditionalChinese => TrayMessages {
            no_actions: "（沒有自訂操作）",
            open_clipwise: "開啟 Clipwise…",
            quit_clipwise: "結束 Clipwise",
            already_running: "另一項文字轉換正在進行中。",
            empty_clipboard: "剪貼簿中沒有可轉換的文字。",
            action_not_found: "找不到該操作。",
        },
    }
}

pub(crate) fn read_clipboard_error(language: AppLanguage, error: &str) -> String {
    match language {
        AppLanguage::English => format!("Could not read the clipboard: {error}"),
        AppLanguage::TraditionalChinese => format!("無法讀取剪貼簿：{error}"),
    }
}

pub(crate) fn processing(language: AppLanguage, action: &str) -> String {
    match language {
        AppLanguage::English => format!("Processing \"{action}\"..."),
        AppLanguage::TraditionalChinese => format!("正在處理「{action}」…"),
    }
}

pub(crate) fn write_clipboard_error(language: AppLanguage, error: &str) -> String {
    match language {
        AppLanguage::English => format!("Could not write the clipboard: {error}"),
        AppLanguage::TraditionalChinese => format!("無法寫入剪貼簿：{error}"),
    }
}

pub(crate) fn completed(language: AppLanguage, action: &str, preview: &str) -> String {
    match language {
        AppLanguage::English => {
            format!("\"{action}\" finished. Copied to clipboard: {preview}")
        }
        AppLanguage::TraditionalChinese => {
            format!("「{action}」已完成。已複製到剪貼簿：{preview}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traditional_chinese_tray_messages_are_localized() {
        let messages = tray_messages(AppLanguage::TraditionalChinese);
        assert_eq!(messages.no_actions, "（沒有自訂操作）");
        assert_eq!(messages.open_clipwise, "開啟 Clipwise…");
        assert_eq!(messages.quit_clipwise, "結束 Clipwise");
        assert_eq!(messages.already_running, "另一項文字轉換正在進行中。");
        assert_eq!(messages.empty_clipboard, "剪貼簿中沒有可轉換的文字。");
        assert_eq!(messages.action_not_found, "找不到該操作。");
        assert_eq!(
            read_clipboard_error(AppLanguage::TraditionalChinese, "錯誤"),
            "無法讀取剪貼簿：錯誤"
        );
        assert_eq!(
            write_clipboard_error(AppLanguage::TraditionalChinese, "錯誤"),
            "無法寫入剪貼簿：錯誤"
        );
        assert_eq!(
            processing(AppLanguage::TraditionalChinese, "摘要"),
            "正在處理「摘要」…"
        );
        assert_eq!(
            completed(AppLanguage::TraditionalChinese, "摘要", "完成"),
            "「摘要」已完成。已複製到剪貼簿：完成"
        );
    }
}
