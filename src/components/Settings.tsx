import { useCallback, useState } from "react";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, AppSettings } from "../types/config";
import ErrorBox from "./ErrorBox";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
}

export default function SettingsPanel({ config, onRefresh }: Props) {
  // Local state for settings - synced via key prop in parent
  const [settings, setSettings] = useState<AppSettings>({
    ...config.settings,
  });
  const [error, setError] = useState<string | null>(null);

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
                Maximum tokens in LLM responses (default: 4096).
              </p>
            </div>
            <select
              value={settings.maxTokens}
              onChange={(e) =>
                updateSettings({ maxTokens: parseInt(e.target.value, 10) })
              }
              className="input select !w-32 text-right"
            >
              <option value={512}>512</option>
              <option value={1024}>1024</option>
              <option value={2048}>2048</option>
              <option value={4096}>4096</option>
              <option value={8192}>8192</option>
              <option value={16384}>16384</option>
              <option value={32768}>32768</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
