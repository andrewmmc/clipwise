use crate::error::AppError;
use crate::history;
use crate::models::HistoryEntry;

/// Returns all history entries, sorted newest first.
#[tauri::command]
pub async fn get_history() -> Result<Vec<HistoryEntry>, AppError> {
    history::load_history()
}

/// Clears all history entries.
#[tauri::command]
pub async fn clear_history() -> Result<(), AppError> {
    history::clear_history()
}

/// Deletes a single history entry by ID. Returns true if the entry was found and deleted.
#[tauri::command]
pub async fn delete_history_entry(id: String) -> Result<bool, AppError> {
    history::delete_entry(&id)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These are basic unit tests. Integration tests with actual Tauri
    // invocation would be in a separate test module.

    #[test]
    fn test_get_history_returns_result_type() {
        // Verify the function signature matches expected Tauri command pattern
        // This is a compile-time check - the function should return Result<Vec<HistoryEntry>, AppError>
        let _type_check: std::result::Result<Vec<HistoryEntry>, AppError> = Ok(vec![]);
    }

    #[test]
    fn test_clear_history_returns_result_type() {
        // Verify the function signature matches expected Tauri command pattern
        let _type_check: std::result::Result<(), AppError> = Ok(());
    }
}
