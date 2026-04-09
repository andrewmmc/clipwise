import { useState } from "react";
import type { Action, AppConfig } from "../types/config";
import { ArrowLeft, RotateCcw, Save } from "lucide-react";

interface Props {
  config: AppConfig;
  initial?: Action;
  onSave: (data: Omit<Action, "id">) => Promise<void>;
  onCancel: () => void;
}

export default function ActionForm({
  config,
  initial,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [providerId, setProviderId] = useState(
    initial?.providerId ?? config.providers[0]?.id ?? "",
  );
  const [userPrompt, setUserPrompt] = useState(initial?.userPrompt ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !userPrompt.trim() || !providerId) {
      setError("Name, provider, and prompt are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        providerId,
        userPrompt: userPrompt.trim(),
        model: model.trim() || undefined,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-semibold text-gray-800">
          {initial ? "Edit Action" : "New Action"}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
      >
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Action Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Refine wording"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <p className="mt-1 text-xs text-gray-400">
            Shown in the LLM Actions menu bar popup.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Provider <span className="text-red-500">*</span>
          </label>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">Select a provider…</option>
            {config.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            User Prompt <span className="text-red-500">*</span>
          </label>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Refine this text, improve clarity and grammar while keeping the original meaning"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <p className="mt-1 text-xs text-gray-400">
            The selected text will be appended to this prompt.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Model Override{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Leave blank to use provider default"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setName(initial?.name ?? "");
              setProviderId(
                initial?.providerId ?? config.providers[0]?.id ?? "",
              );
              setUserPrompt(initial?.userPrompt ?? "");
              setModel(initial?.model ?? "");
              setError(null);
            }}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save Action"}
          </button>
        </div>
      </form>
    </div>
  );
}
