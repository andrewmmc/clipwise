import { useEffect, useState } from "react";
import { tauriCommands } from "../lib/tauri";

export default function useCliProviderEnabled(defaultValue = true) {
  const [enabled, setEnabled] = useState(defaultValue);

  useEffect(() => {
    let cancelled = false;

    void tauriCommands
      .isCliProviderEnabled()
      .then((value) => {
        if (!cancelled) {
          setEnabled(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
