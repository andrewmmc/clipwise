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
  cli: "CLI",
  apple: "Apple Intelligence (On-Device)",
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-text-primary">
            Providers
          </h2>
          <p className="mt-0.5 text-[12px] text-text-tertiary">
            Configure LLM API or CLI providers.
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
          Add Provider
        </button>
      </div>

      {successMessage && <SuccessBox message={successMessage} />}

      {config.providers.length === 0 ? (
        <EmptyState
          icon={<Server size={18} />}
          title="No providers configured"
          description="Add an API key to start."
        />
      ) : (
        <div className="space-y-2">
          {config.providers.map((provider) => {
            const isApple = provider.type === "apple";
            return (
              <div
                key={provider.id}
                className="card flex items-center justify-between p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-text-primary">
                    {provider.name}
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-secondary">
                    {typeLabel[provider.type] ?? provider.type}
                    {provider.defaultModel && ` · ${provider.defaultModel}`}
                    {provider.command && ` · ${provider.command}`}
                  </p>
                  {provider.endpoint && (
                    <p className="truncate text-[12px] text-text-tertiary">
                      {provider.endpoint}
                    </p>
                  )}
                </div>
                {!isApple && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        clearSuccessMessage();
                        setEditing(provider);
                      }}
                      className="btn-icon"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(provider.id)}
                      className="btn-icon btn-icon-danger"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
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
