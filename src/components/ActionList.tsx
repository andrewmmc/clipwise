import { useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, Action } from "../types/config";
import useTransientMessage from "../hooks/useTransientMessage";
import ActionForm from "./ActionForm";
import EmptyState from "./EmptyState";
import SuccessBox from "./SuccessBox";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  FlaskConical,
  Zap,
} from "lucide-react";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
}

const DEFAULT_TEST_INPUT = "The quick brown fox jumps over the lazy dog.";

export default function ActionList({ config, onRefresh }: Props) {
  const [editing, setEditing] = useState<Action | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const {
    message: successMessage,
    showMessage: showSuccessMessage,
    clearMessage: clearSuccessMessage,
  } = useTransientMessage();

  const handleDelete = async (id: string) => {
    await tauriCommands.deleteAction(id);
    setPendingDeleteId(null);
    onRefresh();
  };

  const handleTest = async (action: Action) => {
    const input = testInputs[action.id] || DEFAULT_TEST_INPUT;
    setTesting(action.id);
    setTestResults((r) => ({ ...r, [action.id]: "" }));
    try {
      const result = await tauriCommands.testAction(action.id, input);
      setTestResults((r) => ({ ...r, [action.id]: result }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setTestResults((r) => ({ ...r, [action.id]: `Error: ${message}` }));
    } finally {
      setTesting(null);
    }
  };

  const providerName = (id: string) =>
    config.providers.find((p) => p.id === id)?.name ?? "Unknown provider";

  if (creating) {
    return (
      <ActionForm
        config={config}
        onSave={async (data) => {
          await tauriCommands.addAction(data);
          onRefresh();
          showSuccessMessage("Action saved successfully.");
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  if (editing) {
    return (
      <ActionForm
        config={config}
        initial={editing}
        onSave={async (data) => {
          await tauriCommands.updateAction({ ...data, id: editing.id });
          onRefresh();
          showSuccessMessage("Action saved successfully.");
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold text-text-primary">
            Actions
          </h2>
          <p className="mt-1 max-w-xl text-[11px] text-text-tertiary">
            Your actions appear in the LLM Actions menu bar popup and transform
            the current clipboard text.
          </p>
        </div>
        <button
          onClick={() => {
            clearSuccessMessage();
            setCreating(true);
          }}
          className="mac-button-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition hover:brightness-105"
        >
          <Plus size={14} />
          Add Action
        </button>
      </div>

      {successMessage && <SuccessBox message={successMessage} />}

      {config.actions.length === 0 ? (
        <EmptyState
          icon={<Zap size={18} />}
          title="No actions yet."
          description="Add an action to get started."
        />
      ) : (
        <div className="space-y-2.5">
          {config.actions.map((action) => (
            <div key={action.id} className="mac-card rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <GripVertical
                    size={16}
                    className="mt-0.5 text-text-tertiary/60"
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">
                      {action.name}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {providerName(action.providerId)}
                      {action.model && ` · ${action.model}`}
                    </p>
                    <p className="mt-1 text-[11px] italic text-text-tertiary">
                      {action.userPrompt}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {pendingDeleteId === action.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(action.id)}
                        className="mac-button-danger rounded-md px-2.5 py-1 text-[11px] font-medium"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="mac-button-secondary rounded-md px-2.5 py-1 text-[11px] hover:brightness-98"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          clearSuccessMessage();
                          setEditing(action);
                        }}
                        className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-secondary"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(action.id)}
                        className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Test section */}
              <div className="mt-3 border-t border-border-subtle pt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Test input text…"
                    value={testInputs[action.id] ?? ""}
                    onChange={(e) =>
                      setTestInputs((t) => ({
                        ...t,
                        [action.id]: e.target.value,
                      }))
                    }
                    className="mac-input flex-1 rounded-md px-2.5 py-1.5 text-[11px]"
                  />
                  <button
                    onClick={() => handleTest(action)}
                    disabled={testing === action.id}
                    className="mac-button-secondary flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
                  >
                    <FlaskConical size={12} />
                    {testing === action.id ? "Testing…" : "Test"}
                  </button>
                </div>
                {testResults[action.id] !== undefined && (
                  <div
                    className={[
                      "mt-2 rounded p-2 text-xs",
                      testResults[action.id].startsWith("Error:")
                        ? "border border-error/15 bg-error/10 text-error"
                        : "border border-success/15 bg-success/10 text-success",
                    ].join(" ")}
                  >
                    {testResults[action.id] || "(empty result)"}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
