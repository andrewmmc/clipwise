import { useEffect, useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type {
  AppleModelAvailability,
  Provider,
  ProviderType,
} from "../types/config";
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

function getAppleAvailabilityMessage(
  availability: AppleModelAvailability | null,
): string | null {
  if (!availability || availability.available) return null;

  switch (availability.reason) {
    case "not_enabled":
      return "Apple Intelligence is available on this Mac but not enabled in system settings.";
    case "not_ready":
      return "Apple Intelligence is still preparing its on-device model on this Mac.";
    case "not_supported":
      return "Apple Intelligence is not supported on this Mac.";
    default:
      return "Apple Intelligence is currently unavailable on this Mac.";
  }
}

function validateEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!trimmed) return null;
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
  const [appleAvailability, setAppleAvailability] =
    useState<AppleModelAvailability | null>(null);
  const {
    message: commandTestSuccess,
    showMessage: showCommandTestSuccess,
    clearMessage: clearCommandTestSuccess,
  } = useTransientMessage();

  const clearFormFeedback = () => setError(null);
  const clearCommandFeedback = () => {
    setCommandTestError(null);
    clearCommandTestSuccess();
  };
  const clearAllFeedback = () => {
    clearFormFeedback();
    clearCommandFeedback();
  };

  useEffect(() => {
    let cancelled = false;

    void tauriCommands
      .checkAppleModelAvailability()
      .then((availability) => {
        if (!cancelled) {
          setAppleAvailability(availability);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppleAvailability({
            available: false,
            reason: "unknown",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const appleUnavailableMessage =
    type === "apple" ? getAppleAvailabilityMessage(appleAvailability) : null;
  const appleOptionDisabled = appleAvailability?.available === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Provider name is required.");
      return;
    }
    if (type !== "cli" && type !== "apple" && !apiKey.trim()) {
      setError("API key is required for API providers.");
      return;
    }
    if (type !== "cli" && type !== "apple") {
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
      const isApi = type !== "cli" && type !== "apple";
      const headersObj = Object.fromEntries(headers.filter(([k]) => k.trim()));
      await onSave({
        name: name.trim(),
        type,
        endpoint: isApi ? endpoint.trim() || undefined : undefined,
        apiKey: isApi ? apiKey.trim() || undefined : undefined,
        headers: isApi ? headersObj : {},
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="btn-icon">
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-[13px] font-semibold text-text-primary">
          {initial ? "Edit Provider" : "New Provider"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 p-4">
        {error && <ErrorBox message={error} />}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label label-required">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFormFeedback();
              }}
              placeholder="e.g. Anthropic Claude"
              className="input"
            />
          </div>
          <div>
            <label className="label label-required">Type</label>
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
                className="input select"
              >
                <option value="apple" disabled={appleOptionDisabled}>
                  Apple Intelligence (On-Device)
                </option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI-compatible</option>
                <option value="cli">CLI (claude/codex/copilot)</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-tertiary"
              />
            </div>
            {appleOptionDisabled && (
              <p className="mt-1 text-[12px] text-text-tertiary">
                {getAppleAvailabilityMessage(appleAvailability)}
              </p>
            )}
          </div>
        </div>

        {type === "apple" ? (
          <div className="space-y-1">
            <p className="text-[12px] text-text-secondary">
              Uses Apple&apos;s on-device Foundation Model. No API key or
              configuration needed. Runs privately on your Mac.
            </p>
            {appleUnavailableMessage && (
              <p className="text-[12px] text-amber-600">
                {appleUnavailableMessage}
              </p>
            )}
          </div>
        ) : type !== "cli" ? (
          <ApiProviderForm
            type={type}
            endpoint={endpoint}
            apiKey={apiKey}
            defaultModel={defaultModel}
            headers={headers}
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
          <button type="button" onClick={onCancel} className="btn btn-ghost">
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
            className="btn btn-secondary"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="submit"
            disabled={saving || testingCommand}
            className="btn btn-primary"
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
