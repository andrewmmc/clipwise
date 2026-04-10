import { useEffect, useState } from "react";
import useTransientMessage from "../hooks/useTransientMessage";
import { tauriCommands } from "../lib/tauri";
import type { HistoryEntry } from "../types/bindings/HistoryEntry";
import {
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronRight,
  Trash2,
  XCircle,
} from "lucide-react";
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
    console.log("Clear history button clicked");
    const confirmed = window.confirm(
      "Are you sure you want to clear all history? This cannot be undone.",
    );
    console.log("Confirmed:", confirmed);
    if (!confirmed) {
      return;
    }
    setClearing(true);
    setError(null);
    clearMessage();
    tauriCommands
      .clearHistory()
      .then(() => {
        showMessage("History cleared successfully.");
        setHistory([]);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setClearing(false);
      });
  };

  const handleDeleteEntry = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    setError(null);
    clearMessage();
    try {
      const deleted = await tauriCommands.deleteHistoryEntry(id);
      if (deleted) {
        showMessage("Entry deleted successfully.");
        setHistory((prev) => prev.filter((e) => e.id !== id));
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        setError("Entry not found.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
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
        <div className="text-sm text-gray-400">Loading history…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">History</h2>
          <p className="text-xs text-gray-500">
            {history.length === 0
              ? "No transformations recorded yet."
              : `${history.length} transformation${history.length === 1 ? "" : "s"} logged.`}
          </p>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            disabled={clearing}
            className="flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {clearing ? "Clearing…" : "Clear History"}
          </button>
        )}
      </div>

      {error && <ErrorBox message={error} />}
      {successMessage && <SuccessBox message={successMessage} />}

      {history.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">
            History is empty. Transformations will be logged here when you run
            actions.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            return (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-200 bg-white"
              >
                <button
                  onClick={() => toggleExpanded(entry.id)}
                  className="flex w-full items-start gap-3 p-4 text-left hover:bg-gray-50"
                >
                  <div className="mt-0.5 text-gray-400">
                    {isExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {entry.success ? (
                        <CheckCircle2
                          size={16}
                          className="text-green-500 shrink-0"
                        />
                      ) : (
                        <XCircle size={16} className="text-red-500 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-gray-800">
                        {entry.actionName}
                      </span>
                      <span className="text-xs text-gray-400">via</span>
                      <span className="text-xs text-gray-500">
                        {entry.providerName}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatTimestamp(entry.timestamp)}
                    </p>

                    {!isExpanded && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                        {entry.inputText}
                      </p>
                    )}
                  </div>

                  {isExpanded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEntry(entry.id);
                      }}
                      disabled={deletingIds.has(entry.id)}
                      className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                      title="Delete entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 pt-2 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-600">
                          Input
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(entry.inputText, "input")
                          }
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <Copy size={12} />
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono bg-gray-50 rounded p-2">
                        {entry.inputText}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-600">
                          {entry.success ? "Output" : "Error"}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(
                              entry.outputText,
                              entry.success ? "output" : "error",
                            )
                          }
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <Copy size={12} />
                          Copy
                        </button>
                      </div>
                      <p
                        className={`text-xs whitespace-pre-wrap break-words font-mono rounded p-2 ${
                          entry.success
                            ? "text-gray-700 bg-gray-50"
                            : "text-red-700 bg-red-50"
                        }`}
                      >
                        {entry.outputText}
                      </p>
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
