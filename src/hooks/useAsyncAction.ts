import { useCallback, useRef, useState } from "react";
import { getErrorMessage } from "../lib/errors";

export default function useAsyncAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const activeCount = useRef(0);
  const latestRun = useRef(0);

  const run = useCallback(async <T>(action: () => Promise<T>) => {
    const runId = ++latestRun.current;
    activeCount.current += 1;
    setPending(activeCount.current > 0);
    setError(null);
    try {
      return await action();
    } catch (e) {
      if (runId === latestRun.current) {
        setError(getErrorMessage(e));
      }
      throw e;
    } finally {
      activeCount.current -= 1;
      setPending(activeCount.current > 0);
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
