import { useState } from "react";
import useAsyncAction from "../hooks/useAsyncAction";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, AppSettings } from "../types/config";
import ConfirmDeleteActions from "./ConfirmDeleteActions";
import ErrorBox from "./ErrorBox";
import { BookOpen } from "lucide-react";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
  onShowGuide?: () => void;
}

export default function SettingsPanel({
  config,
  onRefresh,
  onShowGuide,
}: Props) {
  const [settingsState, setSettingsState] = useState({
    source: config.settings,
    settings: { ...config.settings },
  });
  const [confirmingHistoryDisable, setConfirmingHistoryDisable] =
    useState(false);
  const { error, pending, run } = useAsyncAction();
  const settings =
    settingsState.source === config.settings
      ? settingsState.settings
      : config.settings;

  const updateSettings = (nextSettings: Partial<AppSettings>) => {
    if (pending) return;
    const previous = settings;
    const updated = { ...settings, ...nextSettings };
    setSettingsState({ source: config.settings, settings: updated });
    void (async () => {
      try {
        await run(async () => {
          await tauriCommands.saveSettings(updated);
          onRefresh();
        });
      } catch {
        setSettingsState({ source: config.settings, settings: previous });
      }
    })();
  };

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
              disabled={pending}
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
                Start at login
              </p>
              <p className="text-[12px] text-text-tertiary">
                Open Clipwise automatically when you log in to your Mac.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.startAtLogin}
              aria-label="Start at login"
              disabled={pending}
              onClick={() =>
                updateSettings({ startAtLogin: !settings.startAtLogin })
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
                Store up to 100 transformations in plaintext on this Mac,
                including failures (first 500 input and 2,000 output
                characters).
              </p>
            </div>
            {confirmingHistoryDisable ? (
              <div
                className="flex items-center gap-1"
                aria-label="Confirm disabling history"
              >
                <span className="mr-1 text-[11px] text-error">
                  Deletes all saved history.
                </span>
                <ConfirmDeleteActions
                  confirmLabel="Disable"
                  onConfirm={() => {
                    setConfirmingHistoryDisable(false);
                    updateSettings({ historyEnabled: false });
                  }}
                  onCancel={() => setConfirmingHistoryDisable(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={settings.historyEnabled}
                aria-label="Enable history"
                disabled={pending}
                onClick={() => {
                  if (settings.historyEnabled) {
                    setConfirmingHistoryDisable(true);
                  } else {
                    updateSettings({ historyEnabled: true });
                  }
                }}
                className="toggle"
              >
                <span className="toggle-thumb" aria-hidden="true" />
              </button>
            )}
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
              disabled={pending}
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

          {onShowGuide && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <p className="text-[13px] font-medium text-text-primary">
                  Getting started guide
                </p>
                <p className="text-[12px] text-text-tertiary">
                  Review how to configure and use Clipwise.
                </p>
              </div>
              <button
                type="button"
                onClick={onShowGuide}
                className="btn btn-secondary"
              >
                <BookOpen size={14} />
                Show Guide
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
