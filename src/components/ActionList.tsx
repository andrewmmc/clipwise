import { useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, Action } from "../types/config";
import useTransientMessage from "../hooks/useTransientMessage";
import ActionForm from "./ActionForm";
import EmptyState from "./EmptyState";
import SuccessBox from "./SuccessBox";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
}

export default function ActionList({ config, onRefresh }: Props) {
  const [editing, setEditing] = useState<Action | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-text-primary">
            Actions
          </h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">
            Transform clipboard text via menu bar.
          </p>
        </div>
        <button
          onClick={() => {
            clearSuccessMessage();
            setCreating(true);
          }}
          className="btn btn-primary"
        >
          <Plus size={14} />
          Add Action
        </button>
      </div>

      {successMessage && <SuccessBox message={successMessage} />}

      {config.actions.length === 0 ? (
        <EmptyState
          icon={<Zap size={18} />}
          title="No actions yet"
          description="Add an action to get started."
        />
      ) : (
        <div className="space-y-2">
          {config.actions.map((action) => (
            <div key={action.id} className="card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-text-primary">
                    {action.name}
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-secondary">
                    {providerName(action.providerId)}
                    {action.model && ` · ${action.model}`}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[12px] text-text-tertiary">
                    {action.userPrompt}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {pendingDeleteId === action.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(action.id)}
                        className="btn btn-danger px-2 py-1 text-[12px]"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="btn btn-ghost px-2 py-1 text-[12px]"
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
                        className="btn-icon"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(action.id)}
                        className="btn-icon btn-icon-danger"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
