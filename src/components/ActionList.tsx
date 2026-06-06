import { useState } from "react";
import useAsyncAction from "../hooks/useAsyncAction";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, Action } from "../types/config";
import useTransientMessage from "../hooks/useTransientMessage";
import ActionForm from "./ActionForm";
import ConfirmDeleteActions from "./ConfirmDeleteActions";
import EmptyState from "./EmptyState";
import ErrorBox from "./ErrorBox";
import SectionHeader from "./SectionHeader";
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
  const [showProviderHint, setShowProviderHint] = useState(false);
  const {
    error: mutationError,
    run: runMutation,
    clearError,
  } = useAsyncAction();
  const {
    message: successMessage,
    showMessage: showSuccessMessage,
    clearMessage: clearSuccessMessage,
  } = useTransientMessage();

  const hasProviders = config.providers.length > 0;

  const clearListFeedback = () => {
    clearSuccessMessage();
    clearError();
    setShowProviderHint(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await runMutation(async () => {
        await tauriCommands.deleteAction(id);
        setPendingDeleteId(null);
        onRefresh();
      });
    } catch {
      // useAsyncAction captures the displayed error.
    }
  };

  const providerName = (id: string) =>
    config.providers.find((p) => p.id === id)?.name ?? "Unknown provider";

  if (creating) {
    return (
      <ActionForm
        config={config}
        onSave={async (data) => {
          await runMutation(async () => {
            await tauriCommands.addAction(data);
            onRefresh();
            showSuccessMessage("Action saved successfully.");
            setCreating(false);
          });
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
          await runMutation(async () => {
            await tauriCommands.updateAction({ ...data, id: editing.id });
            onRefresh();
            showSuccessMessage("Action saved successfully.");
            setEditing(null);
          });
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Actions"
        description="Transform clipboard text via menu bar."
        actions={
          <button
            onClick={() => {
              clearListFeedback();
              if (hasProviders) {
                setCreating(true);
              } else {
                setShowProviderHint(true);
              }
            }}
            className="btn btn-primary"
          >
            <Plus size={14} />
            Add Action
          </button>
        }
      />

      {successMessage && <SuccessBox message={successMessage} />}
      {mutationError && <ErrorBox message={mutationError} />}
      {showProviderHint && (
        <ErrorBox message="Please add a provider first before creating an action." />
      )}

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
                    <ConfirmDeleteActions
                      onConfirm={() => handleDelete(action.id)}
                      onCancel={() => setPendingDeleteId(null)}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          clearListFeedback();
                          setEditing(action);
                        }}
                        className="btn-icon"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearListFeedback();
                          setPendingDeleteId(action.id);
                        }}
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
