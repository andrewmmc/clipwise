import { useState } from "react";
import useConfig from "./hooks/useConfig";
import { cx } from "./lib/classNames";
import AboutPanel from "./components/About";
import ActionList from "./components/ActionList";
import ErrorBox from "./components/ErrorBox";
import HistoryList from "./components/HistoryList";
import ProviderList from "./components/ProviderList";
import SettingsPanel from "./components/Settings";
import GettingStarted from "./components/GettingStarted";
import { tauriCommands } from "./lib/tauri";
import type { ActionPreset } from "./lib/actionPresets";

type Tab = "actions" | "providers" | "history" | "settings" | "about";
type View = Tab | "getting-started";
type SetupEditor =
  { type: "provider" } | { type: "action"; preset: ActionPreset };

export default function App() {
  const { config, error, loading, refresh, clearError } = useConfig();
  const [activeView, setActiveView] = useState<View | null>(null);
  const [guideReopened, setGuideReopened] = useState(false);
  const [setupEditor, setSetupEditor] = useState<SetupEditor | null>(null);

  if (error && !config) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="card max-w-sm p-6 text-center">
          <ErrorBox title="Failed to load config" message={error} />
          <button
            onClick={() => {
              clearError();
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

  if (loading || !config) {
    return (
      <div className="app-shell flex items-center justify-center">
        <span className="text-[13px] text-text-tertiary">Loading…</span>
      </div>
    );
  }

  const showGuideTab = !config.settings.onboardingCompleted || guideReopened;
  const tabs: { id: View; label: string }[] = [
    ...(showGuideTab
      ? [{ id: "getting-started" as View, label: "Getting Started" }]
      : []),
    { id: "actions", label: "Actions" },
    { id: "providers", label: "Providers" },
    ...(config.settings.historyEnabled
      ? [{ id: "history" as Tab, label: "History" }]
      : []),
    { id: "settings", label: "Settings" },
    { id: "about", label: "About" },
  ];
  const requestedView =
    activeView ??
    (config.settings.onboardingCompleted ? "actions" : "getting-started");
  const visibleActiveView = tabs.some((tab) => tab.id === requestedView)
    ? requestedView
    : "actions";

  const returnToGuide = () => {
    setSetupEditor(null);
    setActiveView("getting-started");
  };

  const selectView = (view: View) => {
    setSetupEditor(null);
    setActiveView(view);
  };

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
              onClick={() => selectView(tab.id)}
              className={cx(
                "relative px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer",
                visibleActiveView === tab.id
                  ? "text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              {tab.label}
              {visibleActiveView === tab.id && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4">
              <ErrorBox title="Failed to refresh config" message={error} />
            </div>
          )}
          {visibleActiveView === "getting-started" && (
            <GettingStarted
              config={config}
              reviewMode={config.settings.onboardingCompleted}
              onRefresh={refresh}
              onSetupProvider={() => {
                setSetupEditor({ type: "provider" });
                setActiveView("providers");
              }}
              onChoosePreset={(preset) => {
                setSetupEditor({ type: "action", preset });
                setActiveView("actions");
              }}
              onFinish={async () => {
                await tauriCommands.saveSettings({
                  ...config.settings,
                  onboardingCompleted: true,
                });
                await refresh();
                setGuideReopened(false);
                setActiveView("actions");
              }}
              onDone={() => {
                setGuideReopened(false);
                setActiveView("actions");
              }}
            />
          )}
          {visibleActiveView === "actions" && (
            <ActionList
              key={setupEditor?.type === "action" ? "setup-action" : "actions"}
              config={config}
              onRefresh={refresh}
              startCreating={setupEditor?.type === "action"}
              creationDraft={
                setupEditor?.type === "action" ? setupEditor.preset : undefined
              }
              onCreateComplete={
                setupEditor?.type === "action" ? returnToGuide : undefined
              }
              onCreateCancel={
                setupEditor?.type === "action" ? returnToGuide : undefined
              }
            />
          )}
          {visibleActiveView === "providers" && (
            <ProviderList
              key={
                setupEditor?.type === "provider"
                  ? "setup-provider"
                  : "providers"
              }
              config={config}
              onRefresh={refresh}
              startCreating={setupEditor?.type === "provider"}
              onCreateComplete={
                setupEditor?.type === "provider" ? returnToGuide : undefined
              }
              onCreateCancel={
                setupEditor?.type === "provider" ? returnToGuide : undefined
              }
            />
          )}
          {visibleActiveView === "settings" && (
            <SettingsPanel
              config={config}
              onRefresh={refresh}
              onShowGuide={() => {
                setGuideReopened(true);
                setActiveView("getting-started");
              }}
            />
          )}
          {visibleActiveView === "history" && <HistoryList />}
          {visibleActiveView === "about" && <AboutPanel />}
        </main>
      </div>
    </div>
  );
}
