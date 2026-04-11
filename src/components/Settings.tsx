import { useEffect, useState } from "react";
import useTransientMessage from "../hooks/useTransientMessage";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, AppSettings } from "../types/config";
import { RotateCcw, Save } from "lucide-react";
import ErrorBox from "./ErrorBox";
import SuccessBox from "./SuccessBox";

interface Props {
  config: AppConfig;
  onRefresh: () => void;
}

export default function SettingsPanel({ config, onRefresh }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    ...config.settings,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    message: successMessage,
    showMessage,
    clearMessage,
  } = useTransientMessage();

  useEffect(() => {
    setSettings({ ...config.settings });
  }, [config.settings]);

  const updateSettings = (nextSettings: Partial<AppSettings>) => {
    setError(null);
    clearMessage();
    setSettings((current) => ({ ...current, ...nextSettings }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await tauriCommands.saveSettings(settings);
      showMessage("Settings saved successfully.");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[13px] font-semibold text-text-primary">
          Settings
        </h2>
        <p className="mt-0.5 text-[12px] text-text-tertiary">
          General application settings.
        </p>
      </div>

      <div className="card p-4">
        <div className="space-y-4">
          {error && <ErrorBox message={error} />}
          {successMessage && <SuccessBox message={successMessage} />}

          <div className="space-y-4">
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

            <div>
              <label className="label">Max Tokens</label>
              <input
                type="number"
                min={256}
                max={32768}
                step={256}
                value={settings.maxTokens}
                onChange={(e) =>
                  updateSettings({
                    maxTokens: parseInt(e.target.value, 10) || 4096,
                  })
                }
                className="input w-32"
              />
              <p className="helper-text">Maximum tokens in LLM responses.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                clearMessage();
                setSettings({ ...config.settings });
              }}
              disabled={saving}
              className="btn btn-secondary"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-[13px] font-semibold text-text-primary">About</h3>
        <div className="mt-2 space-y-1 text-[12px] text-text-secondary">
          <p>
            <strong>LLM Actions</strong> v0.1.0
          </p>
          <p>macOS text transformation via LLM APIs &amp; CLI tools.</p>
          <p className="mt-2 text-text-tertiary">
            Copy text, open the menu bar icon, choose an action. The result is
            copied to your clipboard.
          </p>
        </div>
      </div>
    </div>
  );
}
