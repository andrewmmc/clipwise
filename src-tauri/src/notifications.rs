const NOTIFICATION_PREVIEW_LIMIT: usize = 120;

pub(crate) fn notification_preview(text: &str) -> String {
    let single_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if single_line.chars().count() <= NOTIFICATION_PREVIEW_LIMIT {
        return single_line;
    }

    single_line
        .chars()
        .take(NOTIFICATION_PREVIEW_LIMIT)
        .collect::<String>()
        + "..."
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notification_preview_short_text_unchanged() {
        assert_eq!(notification_preview("Short text"), "Short text");
    }

    #[test]
    fn test_notification_preview_at_exact_limit() {
        let text = "a".repeat(NOTIFICATION_PREVIEW_LIMIT);
        assert_eq!(notification_preview(&text), text);
        assert_eq!(
            notification_preview(&text).chars().count(),
            NOTIFICATION_PREVIEW_LIMIT
        );
    }

    #[test]
    fn test_notification_preview_truncates_at_limit() {
        let text = "a".repeat(NOTIFICATION_PREVIEW_LIMIT + 10);
        let result = notification_preview(&text);
        assert_eq!(result.chars().count(), NOTIFICATION_PREVIEW_LIMIT + 3);
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_notification_preview_collapses_whitespace() {
        let text = "This  has    multiple   spaces\tand\nnewlines";
        assert_eq!(
            notification_preview(text),
            "This has multiple spaces and newlines"
        );
    }

    #[test]
    fn test_notification_preview_handles_multiline() {
        let text = "Line one\nLine two\nLine three";
        assert_eq!(notification_preview(text), "Line one Line two Line three");
    }

    #[test]
    fn test_notification_preview_empty_string() {
        assert_eq!(notification_preview(""), "");
    }

    #[test]
    fn test_notification_preview_only_whitespace() {
        assert_eq!(notification_preview("   \n\t  "), "");
    }

    #[test]
    fn test_notification_preview_unicode_char_counting() {
        assert_eq!(notification_preview("😀😀😀").chars().count(), 3);
    }

    #[test]
    fn test_notification_preview_truncates_unicode_correctly() {
        let text = "😀".repeat(NOTIFICATION_PREVIEW_LIMIT + 10);
        let result = notification_preview(&text);
        assert!(result.is_char_boundary(NOTIFICATION_PREVIEW_LIMIT));
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_notification_preview_preserves_trailing_content_after_truncation() {
        let text = "a".repeat(NOTIFICATION_PREVIEW_LIMIT - 10) + "tail12345678";
        let result = notification_preview(&text);
        assert!(result.starts_with('a'));
        assert!(result.ends_with("..."));
        assert_eq!(result.chars().count(), NOTIFICATION_PREVIEW_LIMIT + 3);
    }
}
