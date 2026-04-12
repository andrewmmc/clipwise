import { Plus, Trash2 } from "lucide-react";
import type { ProviderType } from "../types/config";

interface Props {
  type: Exclude<ProviderType, "cli" | "apple">;
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  headers: [string, string][];
  onEndpointChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onAddHeader: () => void;
  onHeaderKeyChange: (index: number, value: string) => void;
  onHeaderValueChange: (index: number, value: string) => void;
  onRemoveHeader: (index: number) => void;
}

const DEFAULT_ENDPOINTS: Record<
  Exclude<ProviderType, "cli" | "apple">,
  string
> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
};

export default function ApiProviderForm({
  type,
  endpoint,
  apiKey,
  defaultModel,
  headers,
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
        <label className="label">
          API Endpoint{" "}
          <span className="font-normal text-text-tertiary">(optional)</span>
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder={DEFAULT_ENDPOINTS[type]}
          className="input"
        />
        <p className="helper-text">
          Custom endpoints must use a valid https:// URL.
        </p>
      </div>

      <div>
        <label className="label label-required">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="sk-..."
          className="input"
        />
      </div>

      <div>
        <label className="label">Default Model</label>
        <input
          type="text"
          value={defaultModel}
          onChange={(e) => onDefaultModelChange(e.target.value)}
          placeholder={
            type === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o"
          }
          className="input"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Custom Headers</label>
          <button
            type="button"
            onClick={onAddHeader}
            className="btn btn-ghost py-1 text-[12px]"
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
                className="input input-sm flex-1"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => onHeaderValueChange(index, e.target.value)}
                placeholder="Value"
                className="input input-sm flex-1"
              />
              <button
                type="button"
                onClick={() => onRemoveHeader(index)}
                className="btn-icon btn-icon-danger flex size-[30px] shrink-0 items-center justify-center"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
