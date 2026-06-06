import { useCallback, useEffect, useState } from "react";
import useAsyncAction from "../hooks/useAsyncAction";
import useTransientMessage from "../hooks/useTransientMessage";
import { cx } from "../lib/classNames";
import { getErrorMessage } from "../lib/errors";
import { formatHistoryTimestamp } from "../lib/history";
import { tauriCommands } from "../lib/tauri";
import type { HistoryEntry } from "../types/bindings/HistoryEntry";
import { History, Star, Trash2 } from "lucide-react";
import EmptyState from "./EmptyState";
import ErrorBox from "./ErrorBox";
import HistoryEntryCard from "./HistoryEntryCard";
import SuccessBox from "./SuccessBox";

export default function HistoryList() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, run, setError, clearError } = useAsyncAction();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [starringIds, setStarringIds] = useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const {
    message: successMessage,
    showMessage,
    clearMessage,
  } = useTransientMessage();

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await run(() => tauriCommands.getHistory());
      setHistory(entries);
    } catch {
      // useAsyncAction captures the displayed error.
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showMessage(`Copied ${label} to clipboard.`);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleToggleStar = (id: string) => {
    setStarringIds((prev) => new Set(prev).add(id));
    clearError();
    clearMessage();
    void (async () => {
      try {
        const newStarred = await run(() => tauriCommands.toggleStarEntry(id));
        showMessage(newStarred ? "Entry starred." : "Star removed.");
        setHistory((prev) =>
          prev.map((e) => (e.id === id ? { ...e, starred: newStarred } : e)),
        );
        const entries = await run(() => tauriCommands.getHistory());
        setHistory(entries);
      } catch {
        // useAsyncAction captures the displayed error.
      } finally {
        setStarringIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    })();
  };

  const handleClearHistory = () => {
    setClearing(true);
    clearError();
    clearMessage();
    void (async () => {
      try {
        await run(() => tauriCommands.clearHistory());
        const starredCount = history.filter((e) => e.starred).length;
        if (starredCount > 0) {
          showMessage(
            `Cleared non-starred entries. ${starredCount} starred item${starredCount === 1 ? "" : "s"} preserved.`,
          );
        } else {
          showMessage("History cleared.");
        }
        setHistory((prev) => prev.filter((e) => e.starred));
      } catch {
        // useAsyncAction captures the displayed error.
      } finally {
        setClearing(false);
      }
    })();
  };

  const handleDeleteEntry = (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    clearError();
    clearMessage();
    void (async () => {
      try {
        const deleted = await run(() => tauriCommands.deleteHistoryEntry(id));
        if (deleted) {
          showMessage("Entry deleted.");
          setHistory((prev) => prev.filter((e) => e.id !== id));
          setExpandedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      } catch {
        // useAsyncAction captures the displayed error.
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    })();
  };

  const starredCount = history.filter((e) => e.starred).length;
  const displayedHistory = showStarredOnly
    ? history.filter((e) => e.starred)
    : history;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-text-tertiary">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-text-primary">
            History
          </h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">
            {history.length === 0
              ? "No transformations recorded."
              : `${history.length} transformation${history.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {starredCount > 0 && (
            <button
              type="button"
              onClick={() => setShowStarredOnly((prev) => !prev)}
              className={cx(
                "btn",
                showStarredOnly ? "btn-primary" : "btn-ghost",
              )}
              title={showStarredOnly ? "Show all entries" : "Show starred only"}
            >
              <Star
                size={14}
                className={showStarredOnly ? "fill-current" : ""}
              />
              {starredCount}
            </button>
          )}
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearing}
              className="btn btn-danger"
            >
              <Trash2 size={14} />
              {clearing ? "Clearing…" : "Clear"}
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {successMessage && <SuccessBox message={successMessage} />}

      {displayedHistory.length === 0 ? (
        <EmptyState
          icon={<History size={18} />}
          title={
            showStarredOnly && history.length > 0
              ? "No starred entries"
              : "No history yet"
          }
          description={
            showStarredOnly && history.length > 0
              ? "Star entries to keep them safe from clearing."
              : "Transformations will appear here when you run actions."
          }
        />
      ) : (
        <div className="space-y-2">
          {displayedHistory.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            return (
              <HistoryEntryCard
                key={entry.id}
                entry={entry}
                expanded={isExpanded}
                deleting={deletingIds.has(entry.id)}
                starring={starringIds.has(entry.id)}
                timestamp={formatHistoryTimestamp(entry.timestamp)}
                onToggleExpanded={() => toggleExpanded(entry.id)}
                onToggleStar={() => handleToggleStar(entry.id)}
                onDelete={() => handleDeleteEntry(entry.id)}
                onCopy={copyToClipboard}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
