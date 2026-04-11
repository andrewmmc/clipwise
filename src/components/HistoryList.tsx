import { useEffect, useState } from "react";
import useTransientMessage from "../hooks/useTransientMessage";
import { tauriCommands } from "../lib/tauri";
import type { HistoryEntry } from "../types/bindings/HistoryEntry";
import {
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronRight,
  History,
  Trash2,
  XCircle,
} from "lucide-react";
import EmptyState from "./EmptyState";
import ErrorBox from "./ErrorBox";
import SuccessBox from "./SuccessBox";

export default function HistoryList() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const {
    message: successMessage,
    showMessage,
    clearMessage,
  } = useTransientMessage();

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await tauriCommands.getHistory();
      setHistory(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

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
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClearHistory = () => {
    setClearing(true);
    setError(null);
    clearMessage();
    tauriCommands
      .clearHistory()
      .then(() => {
        showMessage("History cleared.");
        setHistory([]);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setClearing(false);
      });
  };

  const handleDeleteEntry = (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    setError(null);
    clearMessage();
    tauriCommands
      .deleteHistoryEntry(id)
      .then((deleted) => {
        if (deleted) {
          showMessage("Entry deleted.");
          setHistory((prev) => prev.filter((e) => e.id !== id));
          setExpandedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    } catch {
      return timestamp;
    }
  };

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

      {error && <ErrorBox message={error} />}
      {successMessage && <SuccessBox message={successMessage} />}

      {history.length === 0 ? (
        <EmptyState
          icon={<History size={18} />}
          title="No history yet"
          description="Transformations will appear here when you run actions."
        />
      ) : (
        <div className="space-y-2">
          {history.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            return (
              <div key={entry.id} className="card">
                <div
                  onClick={() => toggleExpanded(entry.id)}
                  className="flex w-full cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-surface-hover"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpanded(entry.id);
                    }
                  }}
                >
                  <span className="mt-0.5 text-text-tertiary">
                    {isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {entry.success ? (
                        <CheckCircle2
                          size={14}
                          className="shrink-0 text-success"
                        />
                      ) : (
                        <XCircle size={14} className="shrink-0 text-error" />
                      )}
                      <span className="text-[13px] font-medium text-text-primary">
                        {entry.actionName}
                      </span>
                      <span className="text-[12px] text-text-tertiary">
                        {entry.providerName}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-text-tertiary">
                      {formatTimestamp(entry.timestamp)}
                    </p>

                    {!isExpanded && (
                      <p className="mt-1.5 line-clamp-2 text-[12px] text-text-secondary">
                        {entry.inputText}
                      </p>
                    )}
                  </div>

                  {isExpanded && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEntry(entry.id);
                      }}
                      disabled={deletingIds.has(entry.id)}
                      className="btn-icon btn-icon-danger"
                      title="Delete entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t border-border p-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-text-secondary">
                          Input
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(entry.inputText, "input")
                          }
                          className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
                        >
                          <Copy size={12} />
                          Copy
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface-tertiary p-2 text-[12px] font-mono text-text-secondary">
                        {entry.inputText}
                      </pre>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-text-secondary">
                          {entry.success ? "Output" : "Error"}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              entry.outputText,
                              entry.success ? "output" : "error",
                            )
                          }
                          className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
                        >
                          <Copy size={12} />
                          Copy
                        </button>
                      </div>
                      <pre
                        className={[
                          "whitespace-pre-wrap break-words rounded-md border p-2 text-[12px] font-mono",
                          entry.success
                            ? "border-border bg-surface-tertiary text-text-secondary"
                            : "feedback-error",
                        ].join(" ")}
                      >
                        {entry.outputText}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
