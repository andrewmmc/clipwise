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
        <h2 className="text-base font-semibold text-gray-800">Settings</h2>
        <p className="text-xs text-gray-500">General application settings.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="space-y-4">
          {error && <ErrorBox message={error} />}
          {successMessage && <SuccessBox message={successMessage} />}

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Show notification on complete
                </p>
                <p className="text-xs text-gray-400">
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
                className={[
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                  settings.showNotificationOnComplete
                    ? "bg-blue-600"
                    : "bg-gray-200",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    settings.showNotificationOnComplete
                      ? "translate-x-4"
                      : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Enable history
                </p>
                <p className="text-xs text-gray-400">
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
                className={[
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                  settings.historyEnabled ? "bg-blue-600" : "bg-gray-200",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    settings.historyEnabled ? "translate-x-4" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Max Tokens
              </label>
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
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">
                Maximum tokens in LLM responses (256–32768).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                clearMessage();
                setSettings({ ...config.settings });
              }}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">About</h3>
        <div className="space-y-1 text-xs text-gray-500">
          <p>
            <strong>LLM Actions</strong> v0.1.0
          </p>
          <p>macOS text transformation via LLM APIs &amp; CLI tools.</p>
          <p className="mt-2">
            After configuring your actions, copy text and open the menu bar
            icon, then choose an action directly from the menu. The transformed
            result is copied back to your clipboard.
          </p>
          <p className="mt-1 text-gray-400">(c) 2026 Andrew Mok</p>
        </div>
      </div>
    </div>
  );
}
