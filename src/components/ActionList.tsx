import { useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, Action } from "../types/config";
import ActionForm from "./ActionForm";
import { Plus, Pencil, Trash2, GripVertical, FlaskConical } from "lucide-react";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
}

export default function ActionList({ config, onRefresh }: Props) {
  const [editing, setEditing] = useState<Action | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    await tauriCommands.deleteAction(id);
    setPendingDeleteId(null);
    onRefresh();
  };

  const handleTest = async (action: Action) => {
    const input =
      testInputs[action.id] || "The quick brown fox jumps over the lazy dog.";
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
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Actions</h2>
          <p className="text-xs text-gray-500">
            Your actions appear in the LLM Actions menu bar popup and transform
            the current clipboard text.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          <Plus size={14} />
          Add Action
        </button>
      </div>

      {config.actions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">No actions yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Add an action to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {config.actions.map((action) => (
            <div
              key={action.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <GripVertical size={16} className="mt-0.5 text-gray-300" />
                  <div>
                    <p className="font-medium text-gray-800">{action.name}</p>
                    <p className="text-xs text-gray-500">
                      {providerName(action.providerId)}
                      {action.model && ` · ${action.model}`}
                    </p>
                    <p className="mt-1 text-xs text-gray-400 italic">
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
                        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(action)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(action.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Test section */}
              <div className="mt-3 border-t border-gray-100 pt-3">
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
                    className="flex-1 rounded border border-gray-200 px-2.5 py-1 text-xs focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    onClick={() => handleTest(action)}
                    disabled={testing === action.id}
                    className="flex items-center gap-1 rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
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
                        ? "bg-red-50 text-red-600"
                        : "bg-green-50 text-green-700",
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
