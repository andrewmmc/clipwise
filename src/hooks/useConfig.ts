import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../lib/errors";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig } from "../types/config";

export default function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setError(null);
    try {
      const nextConfig = await tauriCommands.getConfig();
      if (requestId === latestRequest.current) {
        setConfig(nextConfig);
      }
    } catch (e) {
      if (requestId === latestRequest.current) {
        setError(getErrorMessage(e));
      }
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
      }
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, error, loading, refresh, clearError };
}
