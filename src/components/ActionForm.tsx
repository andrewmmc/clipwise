import { useId, useState } from "react";
import { cx } from "../lib/classNames";
import { getErrorMessage } from "../lib/errors";
import { tauriCommands } from "../lib/tauri";
import { getActionPresets, type ActionPreset } from "../lib/actionPresets";
import { useI18n } from "../lib/i18n";
import { MAX_USER_PROMPT_LENGTH, validateActionForm } from "../lib/validation";
import type { Action, AppConfig } from "../types/config";
import { ChevronDown, FlaskConical } from "lucide-react";
import EditorHeader from "./EditorHeader";
import ErrorBox from "./ErrorBox";
import FormFooter from "./FormFooter";
import ModelSuggestions from "./ModelSuggestions";

interface Props {
  config: AppConfig;
  initial?: Action;
  draft?: ActionPreset;
  onSave: (data: Omit<Action, "id">) => Promise<void>;
  onCancel: () => void;
}

const DEFAULT_TEST_INPUT = "The quick brown fox jumps over the lazy dog.";

export default function ActionForm({
  config,
  initial,
  draft,
  onSave,
  onCancel,
}: Props) {
  const { locale, t } = useI18n();
  const nameId = useId();
  const providerIdField = useId();
  const promptId = useId();
  const modelId = useId();
  const testInputId = useId();
  const actionPresets = getActionPresets(locale);
  const [name, setName] = useState(initial?.name ?? draft?.name ?? "");
  const [providerId, setProviderId] = useState(
    initial?.providerId ?? config.providers[0]?.id ?? "",
  );
  const [userPrompt, setUserPrompt] = useState(
    initial?.userPrompt ?? draft?.userPrompt ?? "",
  );
  const [model, setModel] = useState(initial?.model ?? "");
  const providerType = config.providers.find((p) => p.id === providerId)?.type;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testFailed, setTestFailed] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateActionForm(
      { name, providerId, userPrompt },
      config,
      locale,
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
    const validationError = validateActionForm(
      { name, providerId, userPrompt },
      config,
      locale,
    );
    if (validationError) {
      setTestFailed(true);
      setTestResult(t("Error: {{message}}", { message: validationError }));
      return;
    }
    const input = testInput || DEFAULT_TEST_INPUT;
    setTesting(true);
    setTestFailed(false);
    setTestResult(null);
    try {
      const result = await tauriCommands.testAction(
        {
          id: initial.id,
          name: name.trim(),
          providerId,
          userPrompt: userPrompt.trim(),
          model: model.trim() || undefined,
        },
        input,
      );
      setTestResult(result);
    } catch (e) {
      const message = getErrorMessage(e);
      setTestFailed(true);
      setTestResult(t("Error: {{message}}", { message }));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <EditorHeader
        title={initial ? t("Edit Action") : t("New Action")}
        onBack={onCancel}
      />

      <form onSubmit={handleSubmit} className="card space-y-4 p-4">
        {error && <ErrorBox message={error} />}

        <div>
          <label htmlFor={nameId} className="label label-required">
            {t("Action Name")}
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder={t("e.g. Refine wording")}
            className="input"
          />
          <p className="helper-text">{t("Shown in the menu bar popup.")}</p>
        </div>

        <div>
          <label htmlFor={providerIdField} className="label label-required">
            {t("Provider")}
          </label>
          <div className="relative">
            <select
              id={providerIdField}
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setError(null);
              }}
              className="input select"
            >
              <option value="">{t("Select a provider…")}</option>
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={promptId} className="label label-required mb-0">
              {t("User Prompt")}
            </label>
            <div className="flex flex-wrap gap-1">
              {actionPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    if (!name.trim()) {
                      setName(preset.name);
                    }
                    setUserPrompt(preset.userPrompt);
                    setError(null);
                  }}
                  className="btn btn-ghost px-2 py-1 text-[11px]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id={promptId}
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              setError(null);
            }}
            rows={3}
            maxLength={MAX_USER_PROMPT_LENGTH}
            placeholder={t(
              "e.g. Refine this text, improve clarity and grammar",
            )}
            className="input"
          />
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="helper-text">
              {t("Selected text appended to this prompt.")}
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
          <label htmlFor={modelId} className="label">
            {t("Model Override")}{" "}
            <span className="font-normal text-text-tertiary">
              {t("(optional)")}
            </span>
          </label>
          <input
            id={modelId}
            type="text"
            list={
              providerType === "openai" || providerType === "anthropic"
                ? `${modelId}-suggestions`
                : undefined
            }
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setError(null);
            }}
            placeholder={t("Leave blank for provider default")}
            className="input"
          />
          <ModelSuggestions
            id={`${modelId}-suggestions`}
            providerType={providerType}
          />
        </div>

        <FormFooter
          saving={saving}
          onCancel={onCancel}
          onReset={() => {
            setName(initial?.name ?? draft?.name ?? "");
            setProviderId(initial?.providerId ?? config.providers[0]?.id ?? "");
            setUserPrompt(initial?.userPrompt ?? draft?.userPrompt ?? "");
            setModel(initial?.model ?? "");
            setError(null);
          }}
        />
      </form>

      {initial && (
        <div className="card space-y-3 p-4">
          <h3 className="text-[12px] font-medium text-text-secondary">
            {t("Test Action")}
          </h3>
          <div className="flex gap-2">
            <input
              id={testInputId}
              type="text"
              placeholder={t("Test input text…")}
              aria-label={t("Test input text…")}
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
              {testing ? t("Testing…") : t("Test")}
            </button>
          </div>
          {testResult !== null && (
            <div
              className={cx(
                "feedback-box text-[12px]",
                testFailed ? "feedback-error" : "feedback-success",
              )}
            >
              {testResult || t("(empty result)")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
