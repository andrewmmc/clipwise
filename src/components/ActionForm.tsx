import { useState } from "react";
import { cx } from "../lib/classNames";
import { getErrorMessage } from "../lib/errors";
import { tauriCommands } from "../lib/tauri";
import { MAX_USER_PROMPT_LENGTH, validateActionForm } from "../lib/validation";
import type { Action, AppConfig } from "../types/config";
import {
  ArrowLeft,
  ChevronDown,
  FlaskConical,
  RotateCcw,
  Save,
} from "lucide-react";
import ErrorBox from "./ErrorBox";

interface Props {
  config: AppConfig;
  initial?: Action;
  onSave: (data: Omit<Action, "id">) => Promise<void>;
  onCancel: () => void;
}

const DEFAULT_TEST_INPUT = "The quick brown fox jumps over the lazy dog.";

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
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateActionForm(
      { name, providerId, userPrompt },
      config,
    );
    if (validationError) {
      setError(validationError);
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
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!initial) return;
    const input = testInput || DEFAULT_TEST_INPUT;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await tauriCommands.testAction(initial.id, input);
      setTestResult(result);
    } catch (e) {
      const message = getErrorMessage(e);
      setTestResult(`Error: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="btn-icon">
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-[13px] font-semibold text-text-primary">
          {initial ? "Edit Action" : "New Action"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 p-4">
        {error && <ErrorBox message={error} />}

        <div>
          <label className="label label-required">Action Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Refine wording"
            className="input"
          />
          <p className="helper-text">Shown in the menu bar popup.</p>
        </div>

        <div>
          <label className="label label-required">Provider</label>
          <div className="relative">
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setError(null);
              }}
              className="input select"
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
          <label className="label label-required">User Prompt</label>
          <textarea
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              setError(null);
            }}
            rows={3}
            maxLength={MAX_USER_PROMPT_LENGTH}
            placeholder="e.g. Refine this text, improve clarity and grammar"
            className="input"
          />
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="helper-text">
              Selected text appended to this prompt.
            </p>
            <span
              className={cx(
                "text-[11px]",
                userPrompt.length > MAX_USER_PROMPT_LENGTH - 200
                  ? "text-error"
                  : "text-text-tertiary",
              )}
            >
              {userPrompt.length}/{MAX_USER_PROMPT_LENGTH}
            </span>
          </div>
        </div>

        <div>
          <label className="label">
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
            placeholder="Leave blank for provider default"
            className="input"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
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
            className="btn btn-secondary"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            <Save size={14} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {initial && (
        <div className="card space-y-3 p-4">
          <h3 className="text-[12px] font-medium text-text-secondary">
            Test Action
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Test input text…"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="input input-sm flex-1"
            />
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn btn-secondary px-2.5 py-1.5 text-[12px]"
            >
              <FlaskConical size={12} />
              {testing ? "Testing…" : "Test"}
            </button>
          </div>
          {testResult !== null && (
            <div
              className={cx(
                "feedback-box text-[12px]",
                testResult.startsWith("Error:")
                  ? "feedback-error"
                  : "feedback-success",
              )}
            >
              {testResult || "(empty result)"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
