import { useCallback, useState } from "react";
import { cx } from "../lib/classNames";
import { getErrorMessage } from "../lib/errors";
import { tauriCommands } from "../lib/tauri";
import type { Action, AppConfig } from "../types/config";
import { Play, Zap, Settings2 } from "lucide-react";
import EmptyState from "./EmptyState";
import ErrorBox from "./ErrorBox";
import RunResultCard, { type RunResult } from "./RunResultCard";

interface Props {
  config: AppConfig;
  onNavigateToActions: () => void;
}

let nextResultId = 0;

export default function ActionRunner({ config, onNavigateToActions }: Props) {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState<RunResult[]>([]);
  const [runningActionIds, setRunningActionIds] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);

  const handleRunAction = useCallback(
    async (action: Action) => {
      const text = inputText.trim();
      if (!text) return;

      setError(null);
      const resultId = `result-${++nextResultId}`;

      const pendingResult: RunResult = {
        id: resultId,
        actionName: action.name,
        inputText: text,
        outputText: "",
        success: true,
        pending: true,
      };

      setResults((prev) => [pendingResult, ...prev]);
      setRunningActionIds((prev) => new Set(prev).add(action.id));

      try {
        const output = await tauriCommands.testAction(action.id, text);
        setResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? { ...r, outputText: output, pending: false }
              : r,
          ),
        );
      } catch (e) {
        setResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? {
                  ...r,
                  outputText: getErrorMessage(e),
                  success: false,
                  pending: false,
                }
              : r,
          ),
        );
      } finally {
        setRunningActionIds((prev) => {
          const next = new Set(prev);
          next.delete(action.id);
          return next;
        });
      }
    },
    [inputText],
  );

  const hasActions = config.actions.length > 0;
  const hasInput = inputText.trim().length > 0;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Input area */}
      <div>
        <label htmlFor="runner-input" className="label">
          Text to transform
        </label>
        <textarea
          id="runner-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste or type the text you want to transform…"
          className="input min-h-[100px] resize-y font-mono text-[12px] leading-relaxed"
          rows={4}
        />
      </div>

      {/* Action buttons */}
      {hasActions ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-secondary">
              Actions
            </span>
            <button
              type="button"
              onClick={onNavigateToActions}
              className="btn-icon"
              title="Manage actions"
            >
              <Settings2 size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.actions.map((action) => {
              const isRunning = runningActionIds.has(action.id);
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleRunAction(action)}
                  disabled={!hasInput || isRunning}
                  className={cx("btn btn-secondary")}
                  title={action.userPrompt}
                >
                  {isRunning ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Play size={14} />
                  )}
                  {action.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Zap size={18} />}
          title="No actions configured"
          description="Create actions in the Actions tab to start transforming text."
        />
      )}

      {error && <ErrorBox message={error} />}

      {/* Results list */}
      {results.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-secondary">
              Results
            </span>
            <button
              type="button"
              onClick={() => setResults([])}
              className="btn btn-ghost py-1 text-[12px]"
            >
              Clear
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {results.map((result) => (
              <RunResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
