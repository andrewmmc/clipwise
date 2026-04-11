import { useState } from "react";
import type { Action, AppConfig } from "../types/config";
import { ArrowLeft, ChevronDown, RotateCcw, Save } from "lucide-react";
import ErrorBox from "./ErrorBox";

interface Props {
  config: AppConfig;
  initial?: Action;
  onSave: (data: Omit<Action, "id">) => Promise<void>;
  onCancel: () => void;
}

const MAX_USER_PROMPT_LENGTH = 2000;

export default function ActionForm({
  config,
  initial,
  onSave,
  onCancel,
}: Props) {
  const fieldClassName = "mac-input w-full rounded-md px-3 py-2 text-sm";
  const selectClassName = `${fieldClassName} appearance-none bg-surface-primary pr-9`;
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
    if (userPrompt.length > MAX_USER_PROMPT_LENGTH) {
      setError(
        `User prompt must be ${MAX_USER_PROMPT_LENGTH} characters or fewer.`,
      );
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-secondary"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-[13px] font-semibold text-text-primary">
          {initial ? "Edit Action" : "New Action"}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mac-panel space-y-4 rounded-2xl p-5"
      >
        {error && <ErrorBox message={error} />}

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-secondary">
            Action Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Refine wording"
            className={fieldClassName}
          />
          <p className="mt-1 text-[11px] text-text-tertiary">
            Shown in the LLM Actions menu bar popup.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-secondary">
            Provider <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setError(null);
              }}
              className={selectClassName}
            >
              <option value="">Select a provider…</option>
              {config.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-tertiary"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-secondary">
            User Prompt <span className="text-red-500">*</span>
          </label>
          <textarea
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              setError(null);
            }}
            rows={3}
            maxLength={MAX_USER_PROMPT_LENGTH}
            placeholder="e.g. Refine this text, improve clarity and grammar while keeping the original meaning"
            className={fieldClassName}
          />
          <div className="mt-1 flex items-center justify-between gap-3 text-xs">
            <p className="text-[11px] text-text-tertiary">
              The selected text will be appended to this prompt.
            </p>
            <p
              className={
                userPrompt.length > MAX_USER_PROMPT_LENGTH - 200
                  ? "text-orange-500"
                  : "text-text-tertiary"
              }
            >
              {userPrompt.length}/{MAX_USER_PROMPT_LENGTH}
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-secondary">
            Model Override{" "}
            <span className="font-normal text-text-tertiary">(optional)</span>
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setError(null);
            }}
            placeholder="Leave blank to use provider default"
            className={fieldClassName}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="mac-button-secondary rounded-md px-4 py-2 text-sm hover:brightness-98"
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
            className="mac-button-secondary flex items-center gap-1.5 rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="submit"
            disabled={saving}
            className="mac-button-primary flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition hover:brightness-105 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save Action"}
          </button>
        </div>
      </form>
    </div>
  );
}
