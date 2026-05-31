import { useEffect, useState } from "react";
import useCliProviderEnabled from "../hooks/useCliProviderEnabled";
import useProviderFormState, {
  getInitialProviderFormState,
} from "../hooks/useProviderFormState";
import { getAppleAvailabilityMessage } from "../lib/appleAvailability";
import { getErrorMessage } from "../lib/errors";
import { PROVIDER_OPTION_LABELS } from "../lib/providers";
import { tauriCommands } from "../lib/tauri";
import { isApiProviderType, validateProviderForm } from "../lib/validation";
import type { AppleModelAvailability, Provider } from "../types/config";
import { ArrowLeft, ChevronDown, RotateCcw, Save } from "lucide-react";
import ApiProviderForm from "./ApiProviderForm";
import CliProviderForm from "./CliProviderForm";
import ErrorBox from "./ErrorBox";
import useTransientMessage from "../hooks/useTransientMessage";
import {
  AppleProviderSection,
  ProviderTypeOption,
} from "./ProviderFormSections";

interface Props {
  initial?: Provider;
  existingProviders?: Provider[];
  onSave: (data: Omit<Provider, "id">) => Promise<void>;
  onCancel: () => void;
}

export default function ProviderForm({
  initial,
  existingProviders = [],
  onSave,
  onCancel,
}: Props) {
  const [form, dispatch] = useProviderFormState(initial);
  const [saving, setSaving] = useState(false);
  const [testingCommand, setTestingCommand] = useState(false);
  const cliEnabled = useCliProviderEnabled();
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
    form.type === "apple"
      ? getAppleAvailabilityMessage(appleAvailability)
      : null;
  const appleProviderExists = existingProviders.some(
    (provider) => provider.type === "apple" && provider.id !== initial?.id,
  );
  const appleDuplicateMessage = appleProviderExists
    ? "Only one Apple Intelligence provider can be configured."
    : null;
  const appleOptionDisabled =
    appleAvailability?.available === false || appleProviderExists;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateProviderForm(
      {
        name: form.name,
        type: form.type,
        endpoint: form.endpoint,
        apiKey: form.apiKey,
        command: form.command,
      },
      appleProviderExists,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isApi = isApiProviderType(form.type);
      const headersObj = Object.fromEntries(
        form.headers.filter(([k]) => k.trim()),
      );
      await onSave({
        name: form.name.trim(),
        type: form.type,
        endpoint: isApi ? form.endpoint.trim() || undefined : undefined,
        apiKey: isApi ? form.apiKey.trim() || undefined : undefined,
        headers: isApi ? headersObj : {},
        defaultModel: form.defaultModel.trim() || undefined,
        command: form.type === "cli" ? form.command.trim() : undefined,
        args: form.type === "cli" ? form.args.filter(Boolean) : [],
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTestCommand = async () => {
    if (!form.command.trim()) {
      clearCommandTestSuccess();
      setCommandTestError("Enter a command before testing.");
      return;
    }
    setTestingCommand(true);
    setCommandTestError(null);
    clearCommandTestSuccess();
    try {
      const result = await tauriCommands.testCliCommand(form.command.trim());
      showCommandTestSuccess(result);
    } catch (e) {
      setCommandTestError(getErrorMessage(e));
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
              value={form.name}
              onChange={(e) => {
                dispatch({
                  type: "field",
                  field: "name",
                  value: e.target.value,
                });
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
                value={form.type}
                onChange={(e) => {
                  const nextType = e.target.value as Provider["type"];
                  clearAllFeedback();
                  dispatch({
                    type: "setType",
                    value: nextType,
                    defaultArgs:
                      nextType === "cli" && !initial && form.args.length === 0,
                  });
                }}
                className="input select"
              >
                <ProviderTypeOption
                  type="apple"
                  label={PROVIDER_OPTION_LABELS.apple}
                  disabled={appleOptionDisabled}
                />
                <ProviderTypeOption
                  type="anthropic"
                  label={PROVIDER_OPTION_LABELS.anthropic}
                />
                <ProviderTypeOption
                  type="openai"
                  label={PROVIDER_OPTION_LABELS.openai}
                />
                {cliEnabled && (
                  <ProviderTypeOption
                    type="cli"
                    label={PROVIDER_OPTION_LABELS.cli}
                  />
                )}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-tertiary"
              />
            </div>
            {appleOptionDisabled && (
              <p className="mt-1 text-[12px] text-text-tertiary">
                {appleDuplicateMessage ??
                  getAppleAvailabilityMessage(appleAvailability)}
              </p>
            )}
          </div>
        </div>

        {form.type === "apple" ? (
          <AppleProviderSection
            duplicateMessage={appleDuplicateMessage}
            unavailableMessage={appleUnavailableMessage}
          />
        ) : isApiProviderType(form.type) ? (
          <ApiProviderForm
            type={form.type}
            endpoint={form.endpoint}
            apiKey={form.apiKey}
            defaultModel={form.defaultModel}
            headers={form.headers}
            onEndpointChange={(value) => {
              dispatch({ type: "field", field: "endpoint", value });
              clearFormFeedback();
            }}
            onApiKeyChange={(value) => {
              dispatch({ type: "field", field: "apiKey", value });
              clearFormFeedback();
            }}
            onDefaultModelChange={(value) => {
              dispatch({ type: "field", field: "defaultModel", value });
              clearFormFeedback();
            }}
            onAddHeader={() => {
              dispatch({ type: "addHeader" });
              clearFormFeedback();
            }}
            onHeaderKeyChange={(index, value) => {
              dispatch({ type: "setHeaderKey", index, value });
              clearFormFeedback();
            }}
            onHeaderValueChange={(index, value) => {
              dispatch({ type: "setHeaderValue", index, value });
              clearFormFeedback();
            }}
            onRemoveHeader={(index) => {
              dispatch({ type: "removeHeader", index });
              clearFormFeedback();
            }}
          />
        ) : (
          <CliProviderForm
            command={form.command}
            args={form.args}
            testingCommand={testingCommand}
            commandTestError={commandTestError}
            commandTestSuccess={commandTestSuccess}
            onCommandChange={(value) => {
              dispatch({ type: "field", field: "command", value });
              clearAllFeedback();
            }}
            onAddArg={() => {
              dispatch({ type: "addArg" });
              clearAllFeedback();
            }}
            onArgChange={(index, value) => {
              dispatch({ type: "setArg", index, value });
              clearAllFeedback();
            }}
            onRemoveArg={(index) => {
              dispatch({ type: "removeArg", index });
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
              dispatch({
                type: "reset",
                value: getInitialProviderFormState(initial),
              });
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
