import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 2000;

export default function useTransientMessage(durationMs = DEFAULT_DURATION_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearMessage = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setMessage(null);
  }, []);

  const showMessage = useCallback(
    (nextMessage: string) => {
      clearMessage();
      setMessage(nextMessage);
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        setMessage(null);
      }, durationMs);
    },
    [clearMessage, durationMs],
  );

  useEffect(() => clearMessage, [clearMessage]);

  return {
    message,
    showMessage,
    clearMessage,
  };
}
