import { useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { Provider, ProviderType } from "../types/config";
import { ArrowLeft, ChevronDown, RotateCcw, Save } from "lucide-react";
import ApiProviderForm from "./ApiProviderForm";
import CliProviderForm from "./CliProviderForm";
import ErrorBox from "./ErrorBox";
import useTransientMessage from "../hooks/useTransientMessage";

interface Props {
  initial?: Provider;
  onSave: (data: Omit<Provider, "id">) => Promise<void>;
  onCancel: () => void;
}

const DEFAULT_CLI_ARGS = ["-p"];
const FIELD_CLASS_NAME =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";

function validateEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("https://")) {
    return "Endpoint URL must be a valid https:// URL.";
  }

  try {
    new URL(trimmed);
    return null;
  } catch {
    return "Endpoint URL must be a valid https:// URL.";
  }
}

export default function ProviderForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<ProviderType>(initial?.type ?? "anthropic");
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? "");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [args, setArgs] = useState<string[]>(
    initial?.type === "cli" ? (initial.args ?? []) : [],
  );
  const [headers, setHeaders] = useState<[string, string][]>(
    Object.entries(initial?.headers ?? {}),
  );
  const [saving, setSaving] = useState(false);
  const [testingCommand, setTestingCommand] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandTestError, setCommandTestError] = useState<string | null>(null);
  const {
    message: commandTestSuccess,
    showMessage: showCommandTestSuccess,
    clearMessage: clearCommandTestSuccess,
  } = useTransientMessage();

  const clearFormFeedback = () => {
    setError(null);
  };

  const clearCommandFeedback = () => {
    setCommandTestError(null);
    clearCommandTestSuccess();
  };

  const clearAllFeedback = () => {
    clearFormFeedback();
    clearCommandFeedback();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Provider name is required.");
      return;
    }
    if (type !== "cli" && !apiKey.trim()) {
      setError("API key is required for API providers.");
      return;
    }
    if (type !== "cli") {
      const endpointError = validateEndpoint(endpoint);
      if (endpointError) {
        setError(endpointError);
        return;
      }
    }
    if (type === "cli" && !command.trim()) {
      setError("Command is required for CLI providers.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const headersObj = Object.fromEntries(headers.filter(([k]) => k.trim()));
      await onSave({
        name: name.trim(),
        type,
        endpoint: type !== "cli" ? endpoint.trim() || undefined : undefined,
        apiKey: type !== "cli" ? apiKey.trim() || undefined : undefined,
        headers: headersObj,
        defaultModel: defaultModel.trim() || undefined,
        command: type === "cli" ? command.trim() : undefined,
        args: type === "cli" ? args.filter(Boolean) : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTestCommand = async () => {
    if (!command.trim()) {
      clearCommandTestSuccess();
      setCommandTestError("Enter a command before testing.");
      return;
    }

    setTestingCommand(true);
    setCommandTestError(null);
    clearCommandTestSuccess();
    try {
      const result = await tauriCommands.testCliCommand(command.trim());
      showCommandTestSuccess(result);
    } catch (e) {
      setCommandTestError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingCommand(false);
    }
  };

  const selectClassName = `${FIELD_CLASS_NAME} appearance-none bg-white pr-9`;

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
          {initial ? "Edit Provider" : "New Provider"}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
      >
        {error && <ErrorBox message={error} />}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFormFeedback();
              }}
              placeholder="e.g. Anthropic Claude"
              className={FIELD_CLASS_NAME}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) => {
                  const nextType = e.target.value as ProviderType;
                  setType(nextType);
                  clearAllFeedback();
                  if (nextType === "cli" && !initial && args.length === 0) {
                    setArgs(DEFAULT_CLI_ARGS);
                  }
                }}
                className={selectClassName}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI-compatible</option>
                <option value="cli">CLI (claude/codex/copilot)</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>
        </div>

        {type !== "cli" ? (
          <ApiProviderForm
            type={type}
            endpoint={endpoint}
            apiKey={apiKey}
            defaultModel={defaultModel}
            headers={headers}
            fieldClassName={FIELD_CLASS_NAME}
            onEndpointChange={(value) => {
              setEndpoint(value);
              clearFormFeedback();
            }}
            onApiKeyChange={(value) => {
              setApiKey(value);
              clearFormFeedback();
            }}
            onDefaultModelChange={(value) => {
              setDefaultModel(value);
              clearFormFeedback();
            }}
            onAddHeader={() => {
              setHeaders((current) => [...current, ["", ""]]);
              clearFormFeedback();
            }}
            onHeaderKeyChange={(index, value) => {
              setHeaders((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? [value, item[1]] : item,
                ),
              );
              clearFormFeedback();
            }}
            onHeaderValueChange={(index, value) => {
              setHeaders((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? [item[0], value] : item,
                ),
              );
              clearFormFeedback();
            }}
            onRemoveHeader={(index) => {
              setHeaders((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              );
              clearFormFeedback();
            }}
          />
        ) : (
          <CliProviderForm
            command={command}
            args={args}
            fieldClassName={FIELD_CLASS_NAME}
            testingCommand={testingCommand}
            commandTestError={commandTestError}
            commandTestSuccess={commandTestSuccess}
            onCommandChange={(value) => {
              setCommand(value);
              clearAllFeedback();
            }}
            onAddArg={() => {
              setArgs((current) => [...current, ""]);
              clearAllFeedback();
            }}
            onArgChange={(index, value) => {
              setArgs((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? value : item,
                ),
              );
              clearAllFeedback();
            }}
            onRemoveArg={(index) => {
              setArgs((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              );
              clearAllFeedback();
            }}
            onTestCommand={handleTestCommand}
          />
        )}

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
              setType(initial?.type ?? "anthropic");
              setEndpoint(initial?.endpoint ?? "");
              setApiKey(initial?.apiKey ?? "");
              setDefaultModel(initial?.defaultModel ?? "");
              setCommand(initial?.command ?? "");
              setArgs(initial?.type === "cli" ? (initial.args ?? []) : []);
              setHeaders(Object.entries(initial?.headers ?? {}));
              clearAllFeedback();
            }}
            disabled={saving || testingCommand}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="submit"
            disabled={saving || testingCommand}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save Provider"}
          </button>
        </div>
      </form>
    </div>
  );
}
