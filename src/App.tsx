import { useEffect, useState } from "react";
import { tauriCommands } from "./lib/tauri";
import type { AppConfig } from "./types/config";
import ActionList from "./components/ActionList";
import ProviderList from "./components/ProviderList";
import SettingsPanel from "./components/Settings";
import { Zap, Server, SlidersHorizontal } from "lucide-react";

type Tab = "actions" | "providers" | "settings";

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
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-semibold text-red-700">Failed to load config</p>
          <p className="mt-1 text-sm text-red-500">{error}</p>
          <button
            onClick={() => {
              setError(null);
              refresh();
            }}
            className="mt-3 rounded bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
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
      </main>
    </div>
  );
}
