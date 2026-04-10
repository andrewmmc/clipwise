import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

// Import AFTER mocking so tauriCommands picks up the mock
const { tauriCommands } = await import("./tauri");

describe("tauriCommands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getConfig calls invoke with 'get_config'", async () => {
    mockInvoke.mockResolvedValue({ providers: [], actions: [], settings: {} });
    await tauriCommands.getConfig();
    expect(mockInvoke).toHaveBeenCalledWith("get_config");
  });

  it("saveSettings calls invoke with correct args", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const settings = { showNotificationOnComplete: false, maxTokens: 2048 };
    await tauriCommands.saveSettings(settings);
    expect(mockInvoke).toHaveBeenCalledWith("save_settings", { settings });
  });

  it("addProvider calls invoke with 'add_provider'", async () => {
    const provider = {
      name: "Test",
      type: "anthropic" as const,
      apiKey: "k",
      headers: {},
      args: [],
    };
    mockInvoke.mockResolvedValue({ ...provider, id: "new-id" });
    await tauriCommands.addProvider(provider);
    expect(mockInvoke).toHaveBeenCalledWith("add_provider", { provider });
  });

  it("updateProvider calls invoke with 'update_provider'", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const provider = {
      id: "p1",
      name: "T",
      type: "anthropic" as const,
      apiKey: "k",
      headers: {},
      args: [],
    };
    await tauriCommands.updateProvider(provider);
    expect(mockInvoke).toHaveBeenCalledWith("update_provider", { provider });
  });

  it("deleteProvider calls invoke with 'delete_provider' and id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await tauriCommands.deleteProvider("p1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_provider", { id: "p1" });
  });

  it("testCliCommand calls invoke with 'test_cli_command'", async () => {
    mockInvoke.mockResolvedValue("Command looks good: /bin/sh");
    const result = await tauriCommands.testCliCommand("/bin/sh");
    expect(mockInvoke).toHaveBeenCalledWith("test_cli_command", {
      command: "/bin/sh",
    });
    expect(result).toBe("Command looks good: /bin/sh");
  });

  it("addAction calls invoke with 'add_action'", async () => {
    const action = { name: "Refine", providerId: "p1", userPrompt: "Fix it" };
    mockInvoke.mockResolvedValue({ ...action, id: "new-id" });
    await tauriCommands.addAction(action);
    expect(mockInvoke).toHaveBeenCalledWith("add_action", { action });
  });

  it("updateAction calls invoke with 'update_action'", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const action = {
      id: "a1",
      name: "Refine",
      providerId: "p1",
      userPrompt: "Fix it",
    };
    await tauriCommands.updateAction(action);
    expect(mockInvoke).toHaveBeenCalledWith("update_action", { action });
  });

  it("deleteAction calls invoke with 'delete_action' and id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await tauriCommands.deleteAction("a1");
    expect(mockInvoke).toHaveBeenCalledWith("delete_action", { id: "a1" });
  });

  it("reorderActions calls invoke with 'reorder_actions' and ids array", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await tauriCommands.reorderActions(["a2", "a1"]);
    expect(mockInvoke).toHaveBeenCalledWith("reorder_actions", {
      ids: ["a2", "a1"],
    });
  });

  it("testAction calls invoke with 'test_action'", async () => {
    mockInvoke.mockResolvedValue("transformed text");
    const result = await tauriCommands.testAction("a1", "sample");
    expect(mockInvoke).toHaveBeenCalledWith("test_action", {
      actionId: "a1",
      sampleText: "sample",
    });
    expect(result).toBe("transformed text");
  });
});
