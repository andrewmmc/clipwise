import { useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, Provider } from "../types/config";
import useTransientMessage from "../hooks/useTransientMessage";
import EmptyState from "./EmptyState";
import ProviderForm from "./ProviderForm";
import SuccessBox from "./SuccessBox";
import { Plus, Pencil, Trash2, Server } from "lucide-react";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
}

const typeLabel: Record<string, string> = {
  openai: "OpenAI-compatible",
  anthropic: "Anthropic",
  cli: "CLI (claude/codex/copilot)",
};

export default function ProviderList({ config, onRefresh }: Props) {
  const [editing, setEditing] = useState<Provider | null>(null);
  const [creating, setCreating] = useState(false);
  const {
    message: successMessage,
    showMessage: showSuccessMessage,
    clearMessage: clearSuccessMessage,
  } = useTransientMessage();

  const handleDelete = async (id: string) => {
    const usedBy = config.actions.filter((a) => a.providerId === id);
    if (usedBy.length > 0) {
      alert(
        `Cannot delete: ${usedBy.length} action(s) use this provider. Remove them first.`,
      );
      return;
    }
    if (!confirm("Delete this provider?")) return;
    await tauriCommands.deleteProvider(id);
    onRefresh();
  };

  if (creating) {
    return (
      <ProviderForm
        onSave={async (data) => {
          await tauriCommands.addProvider(data);
          onRefresh();
          showSuccessMessage("Provider saved successfully.");
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  if (editing) {
    return (
      <ProviderForm
        initial={editing}
        onSave={async (data) => {
          await tauriCommands.updateProvider({ ...data, id: editing.id });
          onRefresh();
          showSuccessMessage("Provider saved successfully.");
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
            Providers
          </h2>
          <p className="mt-1 text-[11px] text-text-tertiary">
            Configure LLM API or CLI providers.
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
          Add Provider
        </button>
      </div>

      {successMessage && <SuccessBox message={successMessage} />}

      {config.providers.length === 0 ? (
        <EmptyState
          icon={<Server size={18} />}
          title="No providers configured."
          description="Add an API key to start."
        />
      ) : (
        <div className="space-y-2.5">
          {config.providers.map((provider) => (
            <div
              key={provider.id}
              className="mac-card flex items-center justify-between rounded-2xl p-4"
            >
              <div>
                <p className="text-[13px] font-semibold text-text-primary">
                  {provider.name}
                </p>
                <p className="text-[11px] text-text-secondary">
                  {typeLabel[provider.type] ?? provider.type}
                  {provider.defaultModel && ` · ${provider.defaultModel}`}
                  {provider.command && ` · ${provider.command}`}
                </p>
                {provider.endpoint && (
                  <p className="text-[11px] text-text-tertiary">
                    {provider.endpoint}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    clearSuccessMessage();
                    setEditing(provider);
                  }}
                  className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-secondary"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(provider.id)}
                  className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
