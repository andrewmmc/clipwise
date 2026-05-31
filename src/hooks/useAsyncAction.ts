import { useCallback, useState } from "react";
import { getErrorMessage } from "../lib/errors";

export default function useAsyncAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = useCallback(async <T>(action: () => Promise<T>) => {
    setPending(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(getErrorMessage(e));
      throw e;
    } finally {
      setPending(false);
    }
  }, []);

  return {
    error,
    pending,
    run,
    setError,
    clearError: () => setError(null),
  };
}
