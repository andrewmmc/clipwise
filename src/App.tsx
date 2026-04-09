import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriCommands } from "./lib/tauri";
import type { AppConfig } from "./types/config";
import ActionList from "./components/ActionList";
import ProviderList from "./components/ProviderList";
import SettingsPanel from "./components/Settings";
import { Zap, Server, SlidersHorizontal, ShieldAlert } from "lucide-react";

type Tab = "actions" | "providers" | "settings";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("actions");
  const [error, setError] = useState<string | null>(null);
  const [needsA11y, setNeedsA11y] = useState<boolean>(false);
  const [checkedA11y, setCheckedA11y] = useState(false);
  const [readyToShow, setReadyToShow] = useState(false);

  const showWindow = async () => {
    try {
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
    } catch (e) {
      console.error("Failed to show window:", e);
    }
  };

  const requestA11y = async () => {
    await tauriCommands.requestAccessibility();
    // Check again after a short delay (user may need time to grant)
    setTimeout(() => {
      tauriCommands.checkAccessibility().then((hasPermission) => {
        setNeedsA11y(!hasPermission);
        if (hasPermission) {
          showWindow();
        }
      });
    }, 500);
  };

  const verifyA11y = async () => {
    const hasPermission = await tauriCommands.checkAccessibility();
    setNeedsA11y(!hasPermission);
    if (hasPermission) {
      await showWindow();
    }
  };

  const refresh = () => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    tauriCommands
      .getConfig()
      .then(setConfig)
      .catch((e) => setError(String(e)));

    // Check accessibility permission
    tauriCommands.checkAccessibility().then((hasPermission) => {
      setNeedsA11y(!hasPermission);
      setCheckedA11y(true);
      // If already has permission or we're skipping, show window when ready
      if (hasPermission) {
        setReadyToShow(true);
      }
    });
  }, []);

  // Show window when both config is loaded and we're ready
  useEffect(() => {
    if (config && readyToShow) {
      showWindow();
    }
  }, [config, readyToShow]);

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

  if (needsA11y && checkedA11y) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-amber-800">
            Accessibility Permission Required
          </h2>
          <p className="mt-2 text-sm text-amber-700">
            LLM Actions needs Accessibility permission to paste transformed text
            back into your apps. This is required for the Services menu
            integration to work.
          </p>
          <p className="mt-3 text-xs text-amber-600">
            You'll be prompted to grant permission. After granting, click
            "Verify" below.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              onClick={requestA11y}
              className="flex-1 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Grant Permission
            </button>
            <button
              onClick={verifyA11y}
              className="rounded bg-amber-200 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-300"
            >
              Verify
            </button>
          </div>
          <button
            onClick={() => {
              setNeedsA11y(false);
              showWindow();
            }}
            className="mt-3 text-xs text-amber-600 underline hover:text-amber-800"
          >
            Skip (features will be limited)
          </button>
        </div>
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
