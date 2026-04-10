import { useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, Provider } from "../types/config";
import EmptyState from "./EmptyState";
import ProviderForm from "./ProviderForm";
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
          <h2 className="text-base font-semibold text-gray-800">Providers</h2>
          <p className="text-xs text-gray-500">
            Configure LLM API or CLI providers.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          <Plus size={14} />
          Add Provider
        </button>
      </div>

      {config.providers.length === 0 ? (
        <EmptyState
          icon={<Server size={18} />}
          title="No providers configured."
          description="Add an API key to start."
        />
      ) : (
        <div className="space-y-2">
          {config.providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-gray-800">{provider.name}</p>
                <p className="text-xs text-gray-500">
                  {typeLabel[provider.type] ?? provider.type}
                  {provider.defaultModel && ` · ${provider.defaultModel}`}
                  {provider.command && ` · ${provider.command}`}
                </p>
                {provider.endpoint && (
                  <p className="text-xs text-gray-400">{provider.endpoint}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditing(provider)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(provider.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
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
