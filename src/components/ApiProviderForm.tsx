import { Plus, Trash2 } from "lucide-react";
import ErrorBox from "./ErrorBox";
import SuccessBox from "./SuccessBox";
import {
  API_PROVIDER_DEFAULT_ENDPOINTS,
  API_PROVIDER_DEFAULT_MODELS,
} from "../lib/providers";
import type { ProviderType } from "../types/config";

interface Props {
  type: Exclude<ProviderType, "cli" | "apple">;
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  headers: [string, string][];
  testingConnection: boolean;
  connectionTestError: string | null;
  connectionTestSuccess: string | null;
  onEndpointChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onDefaultModelChange: (value: string) => void;
  onAddHeader: () => void;
  onHeaderKeyChange: (index: number, value: string) => void;
  onHeaderValueChange: (index: number, value: string) => void;
  onRemoveHeader: (index: number) => void;
  onTestConnection: () => void;
}

export default function ApiProviderForm({
  type,
  endpoint,
  apiKey,
  defaultModel,
  headers,
  testingConnection,
  connectionTestError,
  connectionTestSuccess,
  onEndpointChange,
  onApiKeyChange,
  onDefaultModelChange,
  onAddHeader,
  onHeaderKeyChange,
  onHeaderValueChange,
  onRemoveHeader,
  onTestConnection,
}: Props) {
  return (
    <>
      <p className="text-[12px] text-text-tertiary">
        Text from your clipboard will be sent to this provider&apos;s API for
        processing. Your API key is stored locally on this device only.
      </p>

      <div className="rounded border border-border bg-surface-tertiary px-3 py-2">
        <p className="text-[12px] text-text-tertiary">
          Testing sends a small request to the provider and may incur API usage.
        </p>
        <button
          type="button"
          onClick={onTestConnection}
          disabled={testingConnection}
          className="btn btn-secondary mt-2"
        >
          {testingConnection ? "Testing…" : "Test connection"}
        </button>
        {connectionTestError && (
          <ErrorBox message={connectionTestError} className="mt-2" />
        )}
        {connectionTestSuccess && (
          <SuccessBox message={connectionTestSuccess} className="mt-2" />
        )}
      </div>

      <div>
        <label className="label">
          API Endpoint{" "}
          <span className="font-normal text-text-tertiary">(optional)</span>
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder={API_PROVIDER_DEFAULT_ENDPOINTS[type]}
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
          placeholder={API_PROVIDER_DEFAULT_MODELS[type]}
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
