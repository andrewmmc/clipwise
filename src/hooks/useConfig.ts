import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../lib/errors";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig } from "../types/config";

export default function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  return { config, error, loading, refresh, clearError };
}
