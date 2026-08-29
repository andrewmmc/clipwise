import { useCallback, useEffect, useRef, useState } from "react";
import useAsyncAction from "../hooks/useAsyncAction";
import useTransientMessage from "../hooks/useTransientMessage";
import { cx } from "../lib/classNames";
import { getErrorMessage } from "../lib/errors";
import { formatHistoryTimestamp } from "../lib/history";
import { tauriCommands } from "../lib/tauri";
import type { HistoryEntry } from "../types/bindings/HistoryEntry";
import {
  CircleCheck,
  CircleX,
  History,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import ConfirmDeleteActions from "./ConfirmDeleteActions";
import EmptyState from "./EmptyState";
import ErrorBox from "./ErrorBox";
import HistoryEntryCard from "./HistoryEntryCard";
import SectionHeader from "./SectionHeader";
import SuccessBox from "./SuccessBox";
import { useI18n } from "../lib/i18n";

export default function HistoryList() {
  const { locale, t } = useI18n();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, run, setError, clearError } = useAsyncAction();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [starringIds, setStarringIds] = useState<Set<string>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "success" | "failure"
  >("all");
  const [purging, setPurging] = useState(false);
  const [pendingPurgeAll, setPendingPurgeAll] = useState(false);
  const {
    message: successMessage,
    showMessage,
    clearMessage,
  } = useTransientMessage();
  const activeMutations = useRef(0);

  const beginMutation = () => {
    activeMutations.current += 1;
  };

  const finishMutation = async () => {
    activeMutations.current -= 1;
    if (activeMutations.current !== 0) return;

    try {
      setHistory(await tauriCommands.getHistory());
    } catch {
      // The successful mutation is already reflected locally. A later
      // mutation or tab reload will retry the authoritative refresh.
    }
  };

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
    // Loading starts immediately so the initial render cannot show stale data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
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
      showMessage(t("Copied {{label}} to clipboard.", { label: t(label) }));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleToggleStar = (id: string) => {
    beginMutation();
    setStarringIds((prev) => new Set(prev).add(id));
    clearError();
    clearMessage();
    void (async () => {
      try {
        const newStarred = await run(() => tauriCommands.toggleStarEntry(id));
        showMessage(newStarred ? t("Entry starred.") : t("Star removed."));
        setHistory((prev) =>
          prev.map((e) => (e.id === id ? { ...e, starred: newStarred } : e)),
        );
      } catch {
        // useAsyncAction captures the displayed error.
      } finally {
        setStarringIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        await finishMutation();
      }
    })();
  };

  const handleClearHistory = () => {
    beginMutation();
    setClearing(true);
    clearError();
    clearMessage();
    void (async () => {
      try {
        await run(() => tauriCommands.clearHistory());
        const starredCount = history.filter((e) => e.starred).length;
        if (starredCount > 0) {
          showMessage(
            t(
              starredCount === 1
                ? "Cleared non-starred entries. {{count}} starred item preserved."
                : "Cleared non-starred entries. {{count}} starred items preserved.",
              { count: starredCount },
            ),
          );
        } else {
          showMessage(t("History cleared."));
        }
        setHistory((prev) => prev.filter((e) => e.starred));
      } catch {
        // useAsyncAction captures the displayed error.
      } finally {
        setClearing(false);
        await finishMutation();
      }
    })();
  };

  const handleDeleteEntry = (id: string) => {
    beginMutation();
    setDeletingIds((prev) => new Set(prev).add(id));
    clearError();
    clearMessage();
    void (async () => {
      try {
        const deleted = await run(() => tauriCommands.deleteHistoryEntry(id));
        if (deleted) {
          showMessage(t("Entry deleted."));
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
        await finishMutation();
      }
    })();
  };

  const handlePurgeAll = () => {
    beginMutation();
    setPurging(true);
    clearError();
    clearMessage();
    void (async () => {
      try {
        await run(() => tauriCommands.purgeHistory());
        showMessage(t("All history deleted, including starred entries."));
        setHistory([]);
        setExpandedIds(new Set());
        setShowStarredOnly(false);
        setPendingPurgeAll(false);
      } catch {
        // useAsyncAction captures the displayed error.
      } finally {
        setPurging(false);
        await finishMutation();
      }
    })();
  };

  const matchesSearch = (entry: HistoryEntry, query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    const haystack = [
      entry.actionName,
      entry.providerName,
      entry.inputText,
      entry.outputText,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  };

  const starredCount = history.filter((e) => e.starred).length;
  const displayedHistory = history
    .filter((entry) => !showStarredOnly || entry.starred)
    .filter((entry) =>
      statusFilter === "all"
        ? true
        : statusFilter === "success"
          ? entry.success
          : !entry.success,
    )
    .filter((entry) => matchesSearch(entry, searchQuery));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-text-tertiary">{t("Loading…")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("History")}
        description={
          history.length === 0
            ? t("No transformations recorded.")
            : t(
                history.length === 1
                  ? "{{count}} transformation"
                  : "{{count}} transformations",
                { count: history.length },
              )
        }
        actions={
          <div className="flex items-center gap-2">
            {starredCount > 0 && (
              <button
                type="button"
                onClick={() => setShowStarredOnly((prev) => !prev)}
                className={cx(
                  "btn",
                  showStarredOnly ? "btn-primary" : "btn-ghost",
                )}
                title={
                  showStarredOnly
                    ? t("Show all entries")
                    : t("Show starred only")
                }
              >
                <Star
                  size={14}
                  className={showStarredOnly ? "fill-current" : ""}
                />
                {starredCount}
              </button>
            )}
            {history.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={clearing || purging}
                  className="btn btn-danger"
                  title={t("Clear non-starred entries")}
                >
                  <Trash2 size={14} />
                  {clearing ? t("Clearing…") : t("Clear")}
                </button>
                {pendingPurgeAll ? (
                  <ConfirmDeleteActions
                    onConfirm={handlePurgeAll}
                    onCancel={() => setPendingPurgeAll(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      clearMessage();
                      setPendingPurgeAll(true);
                    }}
                    disabled={clearing || purging}
                    className="btn btn-danger"
                    title={t("Delete all history including starred entries")}
                  >
                    <Trash2 size={14} />
                    {purging ? t("Deleting…") : t("Delete All")}
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      {history.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Search action, provider, input, or output…")}
              className="input input-sm w-full pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cx(
                "btn btn-ghost px-2 py-1 text-[12px]",
                statusFilter === "all" && "btn-primary",
              )}
            >
              {t("All")}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("success")}
              className={cx(
                "btn btn-ghost px-2 py-1 text-[12px]",
                statusFilter === "success" && "btn-primary",
              )}
              title={t("Show successful entries")}
            >
              <CircleCheck size={12} />
              {t("Success")}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("failure")}
              className={cx(
                "btn btn-ghost px-2 py-1 text-[12px]",
                statusFilter === "failure" && "btn-primary",
              )}
              title={t("Show failed entries")}
            >
              <CircleX size={12} />
              {t("Failed")}
            </button>
          </div>
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {successMessage && <SuccessBox message={successMessage} />}

      {displayedHistory.length === 0 ? (
        <EmptyState
          icon={<History size={18} />}
          title={
            history.length === 0
              ? t("No history yet")
              : showStarredOnly
                ? t("No starred entries")
                : searchQuery || statusFilter !== "all"
                  ? t("No matching entries")
                  : t("No history yet")
          }
          description={
            history.length === 0
              ? t("Transformations will appear here when you run actions.")
              : showStarredOnly
                ? t("Star entries to keep them safe from clearing.")
                : searchQuery || statusFilter !== "all"
                  ? t("Try adjusting your search or filters.")
                  : t("Transformations will appear here when you run actions.")
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
                timestamp={formatHistoryTimestamp(entry.timestamp, locale)}
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
