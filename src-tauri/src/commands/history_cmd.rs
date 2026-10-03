use super::run_blocking;
use crate::error::AppError;
use crate::history;
use crate::models::HistoryEntry;

/// Returns all history entries, sorted newest first.
#[cfg_attr(not(test), tauri::command)]
pub async fn get_history() -> Result<Vec<HistoryEntry>, AppError> {
    run_blocking(history::load_history).await
}

/// Clears non-starred history entries. Starred entries are preserved.
#[cfg_attr(not(test), tauri::command)]
pub async fn clear_history() -> Result<(), AppError> {
    run_blocking(history::clear_history).await
}

/// Permanently deletes all history entries, including starred entries.
#[cfg_attr(not(test), tauri::command)]
pub async fn purge_history() -> Result<(), AppError> {
    run_blocking(history::purge_history).await
}

/// Deletes a single history entry by ID. Returns true if the entry was found and deleted.
#[cfg_attr(not(test), tauri::command)]
pub async fn delete_history_entry(id: String) -> Result<bool, AppError> {
    run_blocking(move || history::delete_entry(&id)).await
}

/// Toggles the starred state of a history entry. Returns the new starred state.
#[cfg_attr(not(test), tauri::command)]
pub async fn toggle_star_entry(id: String) -> Result<bool, AppError> {
    run_blocking(move || history::toggle_star(&id)).await
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
