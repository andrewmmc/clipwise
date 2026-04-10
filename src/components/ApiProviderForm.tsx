import { Plus, Trash2 } from "lucide-react";
import type { ProviderType } from "../types/config";

interface Props {
  type: Exclude<ProviderType, "cli">;
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  headers: [string, string][];
  fieldClassName: string;
  onEndpointChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onAddHeader: () => void;
  onHeaderKeyChange: (index: number, value: string) => void;
  onHeaderValueChange: (index: number, value: string) => void;
  onRemoveHeader: (index: number) => void;
}

const DEFAULT_ENDPOINTS: Record<Exclude<ProviderType, "cli">, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
};

export default function ApiProviderForm({
  type,
  endpoint,
  apiKey,
  defaultModel,
  headers,
  fieldClassName,
  onEndpointChange,
  onApiKeyChange,
  onDefaultModelChange,
  onAddHeader,
  onHeaderKeyChange,
  onHeaderValueChange,
  onRemoveHeader,
}: Props) {
  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          API Endpoint{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder={DEFAULT_ENDPOINTS[type]}
          className={fieldClassName}
        />
        <p className="mt-1 text-xs text-gray-400">
          Custom endpoints must use a valid <code>https://</code> URL.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          API Key <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
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
          onChange={(e) => onDefaultModelChange(e.target.value)}
          placeholder={
            type === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o"
          }
          className={fieldClassName}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">
            Custom Headers
          </label>
          <button
            type="button"
            onClick={onAddHeader}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} />
            Add header
          </button>
        </div>
        <div className="space-y-2">
          {headers.map(([key, value], index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={key}
                onChange={(e) => onHeaderKeyChange(index, e.target.value)}
                placeholder="Header name"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => onHeaderValueChange(index, e.target.value)}
                placeholder="Value"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onRemoveHeader(index)}
                className="rounded p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
