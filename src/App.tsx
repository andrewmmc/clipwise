import { useEffect, useState } from "react";
import { cx } from "./lib/classNames";
import { getErrorMessage } from "./lib/errors";
import { tauriCommands } from "./lib/tauri";
import type { AppConfig } from "./types/config";
import AboutPanel from "./components/About";
import ActionList from "./components/ActionList";
import ActionRunner from "./components/ActionRunner";
import ErrorBox from "./components/ErrorBox";
import HistoryList from "./components/HistoryList";
import ProviderList from "./components/ProviderList";
import SettingsPanel from "./components/Settings";

type Tab = "run" | "actions" | "providers" | "history" | "settings" | "about";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("run");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(getErrorMessage(e)));
  };

  useEffect(() => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  if (error) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="card max-w-sm p-6 text-center">
          <ErrorBox title="Failed to load config" message={error} />
          <button
            onClick={() => {
              setError(null);
              refresh();
            }}
            className="btn btn-secondary mt-4"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="app-shell flex items-center justify-center">
        <span className="text-[13px] text-text-tertiary">Loading…</span>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "run", label: "Run" },
    { id: "actions", label: "Actions" },
    { id: "providers", label: "Providers" },
    ...(config.settings.historyEnabled
      ? [{ id: "history" as Tab, label: "History" }]
      : []),
    { id: "settings", label: "Settings" },
    { id: "about", label: "About" },
  ];
  const visibleActiveTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "run";

  return (
    <div className="app-shell">
      <div className="app-container flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h1 className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
            <img
              src="/app-icon.png"
              alt=""
              width={18}
              height={18}
              className="shrink-0 rounded-[4px]"
            />
            Clipwise
          </h1>
          <span className="text-[12px] text-text-tertiary">
            v{__APP_VERSION__}
          </span>
        </header>

        <nav className="flex gap-1 border-b border-border px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                "relative px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer",
                visibleActiveTab === tab.id
                  ? "text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              {tab.label}
              {visibleActiveTab === tab.id && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-5">
          {visibleActiveTab === "run" && (
            <ActionRunner
              config={config}
              onNavigateToActions={() => setActiveTab("actions")}
            />
          )}
          {visibleActiveTab === "actions" && (
            <ActionList config={config} onRefresh={refresh} />
          )}
          {visibleActiveTab === "providers" && (
            <ProviderList config={config} onRefresh={refresh} />
          )}
          {visibleActiveTab === "settings" && (
            <SettingsPanel config={config} onRefresh={refresh} />
          )}
          {visibleActiveTab === "history" && <HistoryList />}
          {visibleActiveTab === "about" && <AboutPanel />}
        </main>
      </div>
    </div>
  );
}
