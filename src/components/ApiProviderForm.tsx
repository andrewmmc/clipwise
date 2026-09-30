import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import ErrorBox from "./ErrorBox";
import SuccessBox from "./SuccessBox";
import {
  API_PROVIDER_DEFAULT_ENDPOINTS,
  API_PROVIDER_DEFAULT_MODELS,
} from "../lib/providers";
import type { ProviderType } from "../types/config";
import { useI18n } from "../lib/i18n";

interface Props {
  type: Exclude<ProviderType, "cli" | "apple">;
  hasStoredApiKey: boolean;
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
  hasStoredApiKey,
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
  const { t } = useI18n();
  const endpointId = useId();
  const apiKeyId = useId();
  const modelId = useId();
  const headersId = useId();
  return (
    <>
      <p className="text-[12px] text-text-tertiary">
        {t(
          "Text from your clipboard will be sent to this provider's API for processing. Your API key and custom header values are stored in macOS Keychain.",
        )}
      </p>

      <div className="rounded border border-border bg-surface-tertiary px-3 py-2">
        <p className="text-[12px] text-text-tertiary">
          {t(
            "Testing sends a small request to the provider and may incur API usage.",
          )}
        </p>
        <button
          type="button"
          onClick={onTestConnection}
          disabled={testingConnection}
          className="btn btn-secondary mt-2"
        >
          {testingConnection ? t("Testing…") : t("Test connection")}
        </button>
        {connectionTestError && (
          <ErrorBox message={connectionTestError} className="mt-2" />
        )}
        {connectionTestSuccess && (
          <SuccessBox message={connectionTestSuccess} className="mt-2" />
        )}
      </div>

      <div>
        <label htmlFor={endpointId} className="label">
          {t("API Endpoint")}{" "}
          <span className="font-normal text-text-tertiary">
            {t("(optional)")}
          </span>
        </label>
        <input
          id={endpointId}
          type="text"
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder={API_PROVIDER_DEFAULT_ENDPOINTS[type]}
          className="input"
        />
        <p className="helper-text">
          {t("Custom endpoints must use a valid https:// URL.")}
        </p>
      </div>

      <div>
        <label
          htmlFor={apiKeyId}
          className={hasStoredApiKey ? "label" : "label label-required"}
        >
          {t("API Key")}
        </label>
        <input
          id={apiKeyId}
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={
            hasStoredApiKey ? t("Leave blank to keep saved key") : "sk-..."
          }
          className="input"
        />
        {hasStoredApiKey && (
          <p className="helper-text">
            {t(
              "Enter a new key only if you want to replace the Keychain value.",
            )}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={modelId} className="label">
          {t("Default Model")}
        </label>
        <input
          id={modelId}
          type="text"
          value={defaultModel}
          onChange={(e) => onDefaultModelChange(e.target.value)}
          placeholder={API_PROVIDER_DEFAULT_MODELS[type]}
          className="input"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0" id={`${headersId}-label`}>
            {t("Custom Headers")}
          </label>
          <button
            type="button"
            onClick={onAddHeader}
            className="btn btn-ghost py-1 text-[12px]"
          >
            <Plus size={12} />
            {t("Add header")}
          </button>
        </div>
        <div className="space-y-2">
          {headers.map(([key, value], index) => (
            <div key={index} className="flex gap-2">
              <input
                id={`${headersId}-${index}-name`}
                type="text"
                value={key}
                onChange={(e) => onHeaderKeyChange(index, e.target.value)}
                placeholder={t("Header name")}
                aria-label={t("Header name")}
                className="input input-sm flex-1"
              />
              <input
                id={`${headersId}-${index}-value`}
                type="text"
                value={value}
                onChange={(e) => onHeaderValueChange(index, e.target.value)}
                placeholder={t("Value")}
                aria-label={t("Value")}
                className="input input-sm flex-1"
              />
              <button
                type="button"
                onClick={() => onRemoveHeader(index)}
                className="btn-icon btn-icon-danger flex size-[30px] shrink-0 items-center justify-center"
                aria-label={t("Remove header")}
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
