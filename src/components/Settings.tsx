import { useRef, useState } from "react";
import useAsyncAction from "../hooks/useAsyncAction";
import { tauriCommands } from "../lib/tauri";
import type { AppConfig, AppSettings } from "../types/config";
import ConfirmDeleteActions from "./ConfirmDeleteActions";
import ErrorBox from "./ErrorBox";
import { BookOpen } from "lucide-react";
import { useI18n } from "../lib/i18n";

interface Props {
  config: AppConfig;
  onRefresh: () => void | Promise<void>;
  onShowGuide?: () => void;
}

export default function SettingsPanel({
  config,
  onRefresh,
  onShowGuide,
}: Props) {
  const { t } = useI18n();
  const [settingsState, setSettingsState] = useState({
    source: config.settings,
    settings: { ...config.settings },
  });
  const [confirmingHistoryDisable, setConfirmingHistoryDisable] =
    useState(false);
  const { error, pending, run } = useAsyncAction();
  const savingRef = useRef(false);
  const settings =
    settingsState.source === config.settings
      ? settingsState.settings
      : config.settings;

  const updateSettings = (nextSettings: Partial<AppSettings>) => {
    if (pending || savingRef.current) return;
    savingRef.current = true;
    const previous = settings;
    const updated = { ...settings, ...nextSettings };
    setSettingsState({ source: config.settings, settings: updated });
    void (async () => {
      try {
        await run(async () => {
          await tauriCommands.saveSettings(updated);
          await onRefresh();
        });
      } catch {
        setSettingsState({ source: config.settings, settings: previous });
      } finally {
        savingRef.current = false;
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
                {t("Show notification on complete")}
              </p>
              <p className="text-[12px] text-text-tertiary">
                {t("Display a macOS notification after text is replaced.")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.showNotificationOnComplete}
              aria-label={t("Show notification on complete")}
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
                {t("Start at login")}
              </p>
              <p className="text-[12px] text-text-tertiary">
                {t("Open Clipwise automatically when you log in to your Mac.")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.startAtLogin}
              aria-label={t("Start at login")}
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
                {t("Enable history")}
              </p>
              <p className="text-[12px] text-text-tertiary">
                {t(
                  "Store up to 100 transformations in plaintext on this Mac, including failures (first 500 input and 2,000 output characters).",
                )}
              </p>
            </div>
            {confirmingHistoryDisable ? (
              <div
                className="flex items-center gap-1"
                aria-label={t("Confirm disabling history")}
              >
                <span className="mr-1 text-[11px] text-error">
                  {t("Deletes all saved history.")}
                </span>
                <ConfirmDeleteActions
                  confirmLabel={t("Disable")}
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
                aria-label={t("Enable history")}
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
                {t("Max tokens")}
              </p>
              <p className="text-[12px] text-text-tertiary">
                {t("Maximum tokens in LLM responses (default: 4096).")}
              </p>
            </div>
            <select
              value={settings.maxTokens}
              aria-label={t("Max tokens")}
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

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-text-primary">
                {t("Language")}
              </p>
            </div>
            <select
              value={settings.language}
              aria-label={t("Language")}
              disabled={pending}
              onChange={(e) =>
                updateSettings({
                  language: e.target.value as AppSettings["language"],
                })
              }
              className="input select !w-48"
            >
              <option value="en">{t("English")}</option>
              <option value="zh-TW">{t("Traditional Chinese")}</option>
            </select>
          </div>

          {onShowGuide && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <p className="text-[13px] font-medium text-text-primary">
                  {t("Getting started guide")}
                </p>
                <p className="text-[12px] text-text-tertiary">
                  {t("Review how to configure and use Clipwise.")}
                </p>
              </div>
              <button
                type="button"
                onClick={onShowGuide}
                className="btn btn-secondary"
              >
                <BookOpen size={14} />
                {t("Show Guide")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
