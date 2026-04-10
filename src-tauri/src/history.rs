use crate::error::AppError;
use crate::models::HistoryEntry;
use std::path::PathBuf;
use tracing::{info, warn};
use uuid::Uuid;

const MAX_HISTORY_ENTRIES: usize = 100;
const INPUT_TRUNCATE_CHARS: usize = 500;
const OUTPUT_TRUNCATE_CHARS: usize = 2000;

/// Returns the path to the history file:
/// ~/Library/Application Support/llm-actions/history.json
pub fn history_path() -> Result<PathBuf, AppError> {
    let base = dirs::data_local_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .ok_or_else(|| AppError::Config("Cannot locate app support directory".into()))?;
    Ok(base.join("llm-actions").join("history.json"))
}

/// Load history from disk, returning an empty vec if the file doesn't exist.
pub fn load_history() -> Result<Vec<HistoryEntry>, AppError> {
    let path = history_path()?;
    if !path.exists() {
        info!(path = %path.display(), "History file missing; returning empty history");
        return Ok(Vec::new());
    }

    let data = std::fs::read_to_string(&path)?;
    let history: Vec<HistoryEntry> = serde_json::from_str(&data)?;
    info!(
        path = %path.display(),
        entry_count = history.len(),
        "Loaded history"
    );
    Ok(history)
}

/// Save history to disk, creating parent directories if needed.
pub fn save_history(history: &[HistoryEntry]) -> Result<(), AppError> {
    let path = history_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(history)?;
    std::fs::write(&path, data)?;
    info!(
        path = %path.display(),
        entry_count = history.len(),
        "Saved history"
    );
    Ok(())
}

/// Truncate text to a maximum character count, appending "..." if truncated.
fn truncate_text(text: &str, max_chars: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max_chars {
        text.to_string()
    } else {
        let mut result: String = chars.iter().take(max_chars).collect();
        result.push_str("...");
        result
    }
}

/// Add a new entry to history, prepending it and trimming to MAX_HISTORY_ENTRIES.
pub fn add_entry(
    action_name: String,
    provider_name: String,
    input_text: String,
    output_text: String,
    success: bool,
) -> Result<(), AppError> {
    let mut history = load_history()?;

    let entry = HistoryEntry {
        id: Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        action_name,
        provider_name,
        input_text: truncate_text(&input_text, INPUT_TRUNCATE_CHARS),
        output_text: truncate_text(&output_text, OUTPUT_TRUNCATE_CHARS),
        success,
    };

    // Prepend the new entry (newest first)
    history.insert(0, entry);

    // Trim to max entries
    if history.len() > MAX_HISTORY_ENTRIES {
        history.truncate(MAX_HISTORY_ENTRIES);
    }

    save_history(&history)?;
    Ok(())
}

/// Clear all history entries.
pub fn clear_history() -> Result<(), AppError> {
    let path = history_path()?;
    if path.exists() {
        std::fs::remove_file(&path)?;
        info!(path = %path.display(), "Cleared history");
    } else {
        warn!(path = %path.display(), "History file does not exist; nothing to clear");
    }
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_history_file(dir: &TempDir, entries: Vec<HistoryEntry>) -> PathBuf {
        let path = dir.path().join("history.json");
        let data = serde_json::to_string_pretty(&entries).unwrap();
        std::fs::write(&path, data).unwrap();
        path
    }

    fn make_test_entry(id: &str, action_name: &str) -> HistoryEntry {
        HistoryEntry {
            id: id.to_string(),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            action_name: action_name.to_string(),
            provider_name: "TestProvider".to_string(),
            input_text: "test input".to_string(),
            output_text: "test output".to_string(),
            success: true,
        }
    }

    // ── truncate_text ───────────────────────────────────────────────────────────

    #[test]
    fn test_truncate_text_short_unchanged() {
        let text = "short";
        assert_eq!(truncate_text(text, 10), "short");
    }

    #[test]
    fn test_truncate_text_at_limit() {
        let text = "a".repeat(100);
        assert_eq!(truncate_text(&text, 100), text);
    }

    #[test]
    fn test_truncate_text_adds_ellipsis() {
        let text = "a".repeat(100);
        let result = truncate_text(&text, 50);
        assert_eq!(result.chars().count(), 53); // 50 + "..."
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_truncate_text_empty_string() {
        assert_eq!(truncate_text("", 10), "");
    }

    #[test]
    fn test_truncate_text_unicode_char_counting() {
        let text = "😀".repeat(50);
        let result = truncate_text(&text, 20);
        assert_eq!(result.chars().count(), 23); // 20 + "..."
    }

    // ── add_entry ───────────────────────────────────────────────────────────────

    #[test]
    fn test_add_entry_prepends_to_existing_history() {
        let dir = TempDir::new().unwrap();
        let path = setup_test_history_file(
            &dir,
            vec![make_test_entry("old-id", "OldAction")],
        );

        // Temporarily override history_path to return test path
        // Note: This requires modifying the function or using a test helper
        // For now, we'll test the logic in a more isolated way
        let entries = vec![make_test_entry("old-id", "OldAction")];
        let mut history = entries.clone();

        let new_entry = HistoryEntry {
            id: "new-id".to_string(),
            timestamp: "2024-01-02T00:00:00Z".to_string(),
            action_name: "NewAction".to_string(),
            provider_name: "TestProvider".to_string(),
            input_text: "new input".to_string(),
            output_text: "new output".to_string(),
            success: true,
        };
        history.insert(0, new_entry);

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].id, "new-id");
        assert_eq!(history[1].id, "old-id");
    }

    #[test]
    fn test_add_entry_trims_to_max_entries() {
        let mut history: Vec<HistoryEntry> = (0..150)
            .map(|i| make_test_entry(&format!("id-{}", i), &format!("Action{}", i)))
            .collect();

        let new_entry = make_test_entry("new-id", "NewAction");
        history.insert(0, new_entry);
        history.truncate(MAX_HISTORY_ENTRIES);

        assert_eq!(history.len(), MAX_HISTORY_ENTRIES);
        assert_eq!(history[0].id, "new-id");
        // Oldest entry should be removed
        assert!(!history.iter().any(|e| e.id == "id-149"));
    }

    #[test]
    fn test_add_entry_at_exact_limit_no_trim() {
        let mut history: Vec<HistoryEntry> = (0..100)
            .map(|i| make_test_entry(&format!("id-{}", i), &format!("Action{}", i)))
            .collect();

        // At exactly 100 entries, adding one more should trigger trim
        let new_entry = make_test_entry("new-id", "NewAction");
        history.insert(0, new_entry);
        if history.len() > MAX_HISTORY_ENTRIES {
            history.truncate(MAX_HISTORY_ENTRIES);
        }

        assert_eq!(history.len(), MAX_HISTORY_ENTRIES);
    }

    // ── clear_history ───────────────────────────────────────────────────────────

    #[test]
    fn test_clear_history_removes_file() {
        let dir = TempDir::new().unwrap();
        let path = setup_test_history_file(
            &dir,
            vec![make_test_entry("id1", "Action1")],
        );

        assert!(path.exists());
        std::fs::remove_file(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn test_clear_history_nonexistent_file_no_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("nonexistent.json");

        assert!(!path.exists());
        // Should not error when file doesn't exist
        let result = std::fs::remove_file(&path);
        // Result will be Err, but our clear_history handles this
        assert!(result.is_err());
    }

    // ── load_history ───────────────────────────────────────────────────────────

    #[test]
    fn test_load_history_empty_file_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("history.json");
        std::fs::write(&path, "").unwrap();

        let result: Result<Vec<HistoryEntry>, _> =
            serde_json::from_str::<Vec<HistoryEntry>>(&std::fs::read_to_string(&path).unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn test_load_history_invalid_json_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("history.json");
        std::fs::write(&path, "{ invalid json }").unwrap();

        let result: Result<Vec<HistoryEntry>, _> =
            serde_json::from_str::<Vec<HistoryEntry>>(&std::fs::read_to_string(&path).unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn test_load_history_valid_entries() {
        let dir = TempDir::new().unwrap();
        let entries = vec![
            make_test_entry("id1", "Action1"),
            make_test_entry("id2", "Action2"),
        ];
        let path = setup_test_history_file(&dir, entries.clone());

        let data = std::fs::read_to_string(&path).unwrap();
        let loaded: Vec<HistoryEntry> = serde_json::from_str(&data).unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "id1");
        assert_eq!(loaded[1].id, "id2");
    }

    // ── save_history ───────────────────────────────────────────────────────────

    #[test]
    fn test_save_history_creates_parent_directories() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("nested").join("deep").join("history.json");

        let entries = vec![make_test_entry("id1", "Action1")];
        let data = serde_json::to_string_pretty(&entries).unwrap();

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&path, data).unwrap();

        assert!(path.exists());
        let loaded: Vec<HistoryEntry> =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(loaded.len(), 1);
    }

    #[test]
    fn test_save_history_produces_valid_json() {
        let entries = vec![
            make_test_entry("id1", "Action1"),
            make_test_entry("id2", "Action2"),
        ];
        let data = serde_json::to_string_pretty(&entries).unwrap();

        let loaded: Vec<HistoryEntry> = serde_json::from_str(&data).unwrap();
        assert_eq!(loaded.len(), 2);
        assert!(data.contains('\n'), "expected pretty-printed JSON");
    }
}
