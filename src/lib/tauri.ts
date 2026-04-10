import { invoke } from "@tauri-apps/api/core";
import type { Action, AppConfig, AppSettings, Provider } from "../types/config";
import type { HistoryEntry } from "../types/bindings/HistoryEntry";

export const tauriCommands = {
  getConfig: (): Promise<AppConfig> => invoke("get_config"),

  saveSettings: (settings: AppSettings): Promise<void> =>
    invoke("save_settings", { settings }),

  // Providers
  addProvider: (provider: Omit<Provider, "id">): Promise<Provider> =>
    invoke("add_provider", { provider }),
  updateProvider: (provider: Provider): Promise<void> =>
    invoke("update_provider", { provider }),
  deleteProvider: (id: string): Promise<void> =>
    invoke("delete_provider", { id }),
  testCliCommand: (command: string): Promise<string> =>
    invoke("test_cli_command", { command }),

  // Actions
  addAction: (action: Omit<Action, "id">): Promise<Action> =>
    invoke("add_action", { action }),
  updateAction: (action: Action): Promise<void> =>
    invoke("update_action", { action }),
  deleteAction: (id: string): Promise<void> => invoke("delete_action", { id }),
  reorderActions: (ids: string[]): Promise<void> =>
    invoke("reorder_actions", { ids }),

  // LLM
  testAction: (actionId: string, sampleText: string): Promise<string> =>
    invoke("test_action", { actionId, sampleText }),

  // History
  getHistory: (): Promise<HistoryEntry[]> => invoke("get_history"),
  clearHistory: (): Promise<void> => invoke("clear_history"),
  deleteHistoryEntry: (id: string): Promise<boolean> =>
    invoke("delete_history_entry", { id }),
};
