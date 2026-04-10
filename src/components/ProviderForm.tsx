import { useState } from "react";
import type { Provider, ProviderType } from "../types/config";
import {
  ArrowLeft,
  ChevronDown,
  RotateCcw,
  Save,
  Plus,
  Trash2,
} from "lucide-react";

interface Props {
  initial?: Provider;
  onSave: (data: Omit<Provider, "id">) => Promise<void>;
  onCancel: () => void;
}

const DEFAULT_CLI_ARGS = ["-p"];

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
  const [error, setError] = useState<string | null>(null);

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

  const defaultEndpoints: Record<string, string> = {
    openai: "https://api.openai.com/v1/chat/completions",
    anthropic: "https://api.anthropic.com/v1/messages",
  };
  const fieldClassName =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";
  const selectClassName = `${fieldClassName} appearance-none bg-white pr-9`;
  const cliInputProps = {
    autoCapitalize: "none" as const,
    autoCorrect: "off" as const,
    spellCheck: false,
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
          {initial ? "Edit Provider" : "New Provider"}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Anthropic Claude"
              className={fieldClassName}
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
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                API Endpoint{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={defaultEndpoints[type] ?? "https://..."}
                className={fieldClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                API Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={fieldClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Default Model
              </label>
              <input
                type="text"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                placeholder={
                  type === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o"
                }
                className={fieldClassName}
              />
            </div>

            {/* Custom headers */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">
                  Custom Headers
                </label>
                <button
                  type="button"
                  onClick={() => setHeaders((h) => [...h, ["", ""]])}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus size={12} />
                  Add header
                </button>
              </div>
              <div className="space-y-2">
                {headers.map(([k, v], i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={k}
                      onChange={(e) =>
                        setHeaders((h) =>
                          h.map((item, idx) =>
                            idx === i ? [e.target.value, item[1]] : item,
                          ),
                        )
                      }
                      placeholder="Header name"
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={v}
                      onChange={(e) =>
                        setHeaders((h) =>
                          h.map((item, idx) =>
                            idx === i ? [item[0], e.target.value] : item,
                          ),
                        )
                      }
                      placeholder="Value"
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setHeaders((h) => h.filter((_, idx) => idx !== i))
                      }
                      className="rounded p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Command <span className="text-red-500">*</span>
              </label>
              <p className="mb-1 text-xs text-gray-400">
                Find the installed binary path with{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
                  where claude
                </code>
                ,{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
                  where codex
                </code>
                , or{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
                  where copilot
                </code>
                .
              </p>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. claude"
                className={`${fieldClassName} font-mono`}
                {...cliInputProps}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">
                  Arguments
                </label>
                <button
                  type="button"
                  onClick={() => setArgs((a) => [...a, ""])}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus size={12} />
                  Add arg
                </button>
              </div>
              <p className="mb-2 text-xs text-gray-400">
                Configure the CLI to run in headless mode so LLM Actions can
                capture the output from stdout. For example,{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-600">
                  -p
                </code>
                .
              </p>
              <div className="space-y-2">
                {args.map((arg, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={arg}
                      onChange={(e) =>
                        setArgs((a) =>
                          a.map((item, idx) =>
                            idx === i ? e.target.value : item,
                          ),
                        )
                      }
                      placeholder="e.g. --print"
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:border-blue-400 focus:outline-none"
                      {...cliInputProps}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setArgs((a) => a.filter((_, idx) => idx !== i))
                      }
                      className="rounded p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {args.length === 0 && (
                  <p className="text-xs text-gray-400">
                    No arguments. Common: --print -m sonnet
                  </p>
                )}
              </div>
            </div>
          </>
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
            {saving ? "Saving…" : "Save Provider"}
          </button>
        </div>
      </form>
    </div>
  );
}
