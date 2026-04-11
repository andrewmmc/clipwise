import { useCallback, useEffect, useRef, useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, AppSettings } from "../types/config";
import ErrorBox from "./ErrorBox";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
}

const MIN_TOKENS = 256;
const MAX_TOKENS = 32768;

export default function SettingsPanel({ config, onRefresh }: Props) {
  // Local state for settings - synced via key prop in parent
  const [settings, setSettings] = useState<AppSettings>({
    ...config.settings,
  });
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSettings = useCallback(
    async (nextSettings: AppSettings) => {
      setError(null);
      try {
        await tauriCommands.saveSettings(nextSettings);
        onRefresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [onRefresh],
  );

  const updateSettings = useCallback(
    (nextSettings: Partial<AppSettings>) => {
      setSettings((current) => {
        const updated = { ...current, ...nextSettings };
        // Auto-save immediately for toggles
        saveSettings(updated);
        return updated;
      });
    },
    [saveSettings],
  );

  const updateMaxTokens = useCallback(
    (value: number) => {
      // Clamp value between min and max
      const clamped = Math.min(
        MAX_TOKENS,
        Math.max(MIN_TOKENS, value || MIN_TOKENS),
      );
      setSettings((current) => {
        const updated = { ...current, maxTokens: clamped };
        // Debounce save for number input
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          saveSettings(updated);
        }, 500);
        return updated;
      });
    },
    [saveSettings],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="space-y-4">
          {error && <ErrorBox message={error} />}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-text-primary">
                Show notification on complete
              </p>
              <p className="text-[12px] text-text-tertiary">
                Display a macOS notification after text is replaced.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showNotificationOnComplete}
              aria-label="Show notification on complete"
              onClick={() =>
                updateSettings({
                  showNotificationOnComplete:
                    !settings.showNotificationOnComplete,
                })
              }
              className="toggle"
            >
              <span className="toggle-thumb" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-text-primary">
                Enable history
              </p>
              <p className="text-[12px] text-text-tertiary">
                Keep a log of the last 100 text transformations.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.historyEnabled}
              aria-label="Enable history"
              onClick={() =>
                updateSettings({
                  historyEnabled: !settings.historyEnabled,
                })
              }
              className="toggle"
            >
              <span className="toggle-thumb" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-text-primary">
                Max tokens
              </p>
              <p className="text-[12px] text-text-tertiary">
                Maximum tokens in LLM responses ({MIN_TOKENS}–{MAX_TOKENS}).
              </p>
            </div>
            <input
              type="number"
              min={MIN_TOKENS}
              max={MAX_TOKENS}
              step={256}
              value={settings.maxTokens}
              onChange={(e) => updateMaxTokens(parseInt(e.target.value, 10))}
              onBlur={(e) => {
                const clamped = Math.min(
                  MAX_TOKENS,
                  Math.max(
                    MIN_TOKENS,
                    parseInt(e.target.value, 10) || MIN_TOKENS,
                  ),
                );
                if (clamped !== settings.maxTokens) {
                  updateMaxTokens(clamped);
                }
              }}
              className="input w-28 text-right"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
