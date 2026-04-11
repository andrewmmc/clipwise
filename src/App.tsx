import { useEffect, useState } from "react";
import { tauriCommands } from "./lib/tauri";
import type { AppConfig } from "./types/config";
import ActionList from "./components/ActionList";
import ErrorBox from "./components/ErrorBox";
import HistoryList from "./components/HistoryList";
import ProviderList from "./components/ProviderList";
import SettingsPanel from "./components/Settings";

type Tab = "actions" | "providers" | "settings" | "history";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("actions");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="app-shell flex items-center justify-center">
        <ErrorBox
          title="Failed to load config"
          message={error}
          className="mac-panel relative z-10 max-w-sm rounded-2xl p-6 text-center"
          action={
            <button
              onClick={() => {
                setError(null);
                refresh();
              }}
              className="mac-button-secondary mt-4 rounded-md px-4 py-1.5 text-sm font-medium transition-colors hover:brightness-98"
            >
              Retry
            </button>
          }
        />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="relative z-10 text-sm text-text-tertiary">Loading…</div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; detail: string }[] = [
    {
      id: "actions",
      label: "Actions",
      detail: `${config.actions.length} total`,
    },
    {
      id: "providers",
      label: "Providers",
      detail: `${config.providers.length} configured`,
    },
    { id: "settings", label: "Settings", detail: "Application defaults" },
    { id: "history", label: "History", detail: "Recent transformations" },
  ];

  return (
    <div className="app-shell">
      <div className="relative z-10 flex h-full flex-col overflow-hidden rounded-[22px]">
        <header className="flex items-start justify-between border-b border-border-subtle px-6 pb-4 pt-5">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-text-tertiary">
              Services
            </p>
            <h1 className="text-[14px] font-semibold text-text-primary">
              LLM Actions
            </h1>
            <p className="text-[13px] text-text-secondary">
              Native-style controls for text transformations across macOS apps.
            </p>
          </div>
          <div className="rounded-full border border-border-subtle bg-surface-primary/55 px-3 py-1 text-[11px] text-text-tertiary shadow-sm backdrop-blur">
            Fixed settings window
          </div>
        </header>

        <nav className="flex items-end gap-6 border-b border-border-subtle px-6 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "group relative pb-3 text-left transition-colors",
                activeTab === tab.id
                  ? "text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary",
              ].join(" ")}
            >
              <span className="block text-[13px] font-semibold">
                {tab.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-text-tertiary transition-colors group-hover:text-text-secondary">
                {tab.detail}
              </span>
              <span
                className={[
                  "absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-all",
                  activeTab === tab.id
                    ? "bg-accent opacity-100"
                    : "bg-transparent opacity-0",
                ].join(" ")}
              />
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "actions" && (
            <ActionList config={config} onRefresh={refresh} />
          )}
          {activeTab === "providers" && (
            <ProviderList config={config} onRefresh={refresh} />
          )}
          {activeTab === "settings" && (
            <SettingsPanel config={config} onRefresh={refresh} />
          )}
          {activeTab === "history" && <HistoryList />}
        </main>
      </div>
    </div>
  );
}
