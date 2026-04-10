import { useEffect, useState } from "react";
import { tauriCommands } from "./lib/tauri";
import type { AppConfig } from "./types/config";
import ActionList from "./components/ActionList";
import ErrorBox from "./components/ErrorBox";
import HistoryList from "./components/HistoryList";
import ProviderList from "./components/ProviderList";
import SettingsPanel from "./components/Settings";
import { Clock, Server, SlidersHorizontal, Zap } from "lucide-react";

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
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <ErrorBox
          title="Failed to load config"
          message={error}
          className="max-w-sm p-6 text-center"
          action={
            <button
              onClick={() => {
                setError(null);
                refresh();
              }}
              className="mt-3 rounded bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700"
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
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "actions", label: "Actions", icon: <Zap size={15} /> },
    { id: "providers", label: "Providers", icon: <Server size={15} /> },
    {
      id: "settings",
      label: "Settings",
      icon: <SlidersHorizontal size={15} />,
    },
    {
      id: "history",
      label: "History",
      icon: <Clock size={15} />,
    },
  ];

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h1 className="text-sm font-semibold text-gray-800">LLM Actions</h1>
        </div>
        <p className="text-xs text-gray-400">macOS text transformation</p>
      </header>

      {/* Tab bar */}
      <nav className="flex border-b border-gray-200 bg-white px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-5">
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
  );
}
