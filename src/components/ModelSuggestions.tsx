import { API_PROVIDER_MODEL_SUGGESTIONS } from "../lib/providers";
import type { ProviderType } from "../types/config";

interface Props {
  id: string;
  providerType?: ProviderType;
}

export default function ModelSuggestions({ id, providerType }: Props) {
  const models = providerType && API_PROVIDER_MODEL_SUGGESTIONS[providerType];
  if (!models) return null;

  return (
    <datalist id={id}>
      {models.map((model) => (
        <option key={model} value={model} />
      ))}
    </datalist>
  );
}
