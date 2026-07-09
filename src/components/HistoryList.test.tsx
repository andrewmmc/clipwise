import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import HistoryList from "./HistoryList";
import * as tauri from "../lib/tauri";
import type { HistoryEntry } from "../types/bindings/HistoryEntry";

vi.mock("../lib/tauri", () => ({
  tauriCommands: {
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
    purgeHistory: vi.fn(),
    deleteHistoryEntry: vi.fn(),
    toggleStarEntry: vi.fn(),
  },
}));

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

describe("HistoryList", () => {
  const mockHistory: HistoryEntry[] = [
    {
      id: "1",
      timestamp: "2024-01-01T12:00:00Z",
      actionName: "Summarize",
      providerName: "Anthropic",
      inputText:
        "This is a long input text that should be displayed in the history",
      outputText: "Summary text",
      success: true,
      starred: false,
    },
    {
      id: "2",
      timestamp: "2024-01-01T11:00:00Z",
      actionName: "Translate",
      providerName: "OpenAI",
      inputText: "Hello world",
      outputText: "Error: API key invalid",
      success: false,
      starred: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state initially", () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockImplementation(
      () => new Promise(() => {}),
    );

    const { container } = render(<HistoryList />);
    expect(container.textContent).toContain("Loading");
  });

  it("displays empty state when no history", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue([]);

    render(<HistoryList />);

    await waitFor(() => {
      expect(
        screen.getByText(/transformations will appear here/i),
      ).toBeInTheDocument();
    });
  });

  it("shows load errors", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockRejectedValue(
      new Error("load failed"),
    );

    render(<HistoryList />);

    await waitFor(() =>
      expect(screen.getByText("load failed")).toBeInTheDocument(),
    );
  });

  it("shows non-Error load failures", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockRejectedValue("load failed");

    render(<HistoryList />);

    await waitFor(() =>
      expect(screen.getByText("load failed")).toBeInTheDocument(),
    );
  });

  it("displays history entries", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
      expect(screen.getByText("Translate")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
    });
  });

  it("shows entry count in header", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("2 transformations")).toBeInTheDocument();
    });
  });

  it("shows success and failure indicators", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const checkIcons = document.querySelectorAll("svg.lucide-circle-check");
    expect(checkIcons.length).toBeGreaterThan(0);

    const errorIcons = document.querySelectorAll("svg.lucide-circle-x");
    expect(errorIcons.length).toBeGreaterThan(0);
  });

  it("expands entry when clicked", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const firstEntry = screen.getByText("Summarize").closest("div");
    expect(firstEntry).toBeDefined();
    fireEvent.click(firstEntry!);

    await waitFor(() => {
      expect(screen.getByText("Summary text")).toBeInTheDocument();
    });
  });

  it("clears history after confirmation", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.clearHistory).mockResolvedValue(undefined);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getAllByText("Clear")).toHaveLength(1);
    });

    const clearButton = screen.getAllByText("Clear")[0];
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(tauri.tauriCommands.clearHistory).toHaveBeenCalled();
    });
  });

  it("shows singular clear message when one starred entry is preserved", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.clearHistory).mockResolvedValue(undefined);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getAllByText("Clear")[0]);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Cleared non-starred entries. 1 starred item preserved.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("shows plural clear message when multiple starred entries are preserved", async () => {
    const starredHistory = mockHistory.map((entry) => ({
      ...entry,
      starred: true,
    }));
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(starredHistory);
    vi.mocked(tauri.tauriCommands.clearHistory).mockResolvedValue(undefined);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getAllByText("Clear")[0]);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Cleared non-starred entries. 2 starred items preserved.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("shows cleared message when no starred entries are preserved", async () => {
    const noStarredHistory = mockHistory.map((entry) => ({
      ...entry,
      starred: false,
    }));
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(
      noStarredHistory,
    );
    vi.mocked(tauri.tauriCommands.clearHistory).mockResolvedValue(undefined);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getAllByText("Clear")[0]);

    await waitFor(() =>
      expect(screen.getByText("History cleared.")).toBeInTheDocument(),
    );
  });

  it("shows error when clear fails", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.clearHistory).mockRejectedValue(
      new Error("clear failed"),
    );

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getAllByText("Clear")[0]);

    await waitFor(() =>
      expect(screen.getByText("clear failed")).toBeInTheDocument(),
    );
  });

  it("preserves starred entries after clear", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.clearHistory).mockResolvedValue(undefined);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const clearButton = screen.getAllByText("Clear")[0];
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(tauri.tauriCommands.clearHistory).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("Translate")).toBeInTheDocument();
    });
  });

  it("copies input to clipboard", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    const mockWriteText = vi.mocked(navigator.clipboard.writeText);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const firstEntry = screen.getByText("Summarize").closest("div");
    fireEvent.click(firstEntry!);

    await waitFor(() => {
      const copyButtons = screen.getAllByText("Copy");
      expect(copyButtons.length).toBeGreaterThan(0);
    });

    const copyButtons = screen.getAllByText("Copy");
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(
        "This is a long input text that should be displayed in the history",
      );
    });
  });

  it("shows copy errors", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("copy failed"),
    );

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByText("Summarize"));
    await waitFor(() => screen.getAllByText("Copy"));
    fireEvent.click(screen.getAllByText("Copy")[0]);

    await waitFor(() =>
      expect(screen.getByText("copy failed")).toBeInTheDocument(),
    );
  });

  it("shows non-Error copy failures", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      "copy failed",
    );

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByText("Summarize"));
    await waitFor(() => screen.getAllByText("Copy"));
    fireEvent.click(screen.getAllByText("Copy")[0]);

    await waitFor(() =>
      expect(screen.getByText("copy failed")).toBeInTheDocument(),
    );
  });

  it("copies failed output as an error", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    const mockWriteText = vi.mocked(navigator.clipboard.writeText);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Translate"));
    fireEvent.click(screen.getByText("Translate"));
    await waitFor(() => screen.getByText("Error"));
    fireEvent.click(screen.getAllByText("Copy")[1]);

    await waitFor(() =>
      expect(mockWriteText).toHaveBeenCalledWith("Error: API key invalid"),
    );
    expect(screen.getByText("Copied error to clipboard.")).toBeInTheDocument();
  });

  it("deletes single entry when delete button clicked", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.deleteHistoryEntry).mockResolvedValue(true);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const firstEntry = screen.getByText("Summarize").closest("div");
    fireEvent.click(firstEntry!);

    await waitFor(() => {
      expect(screen.getByText("Input")).toBeInTheDocument();
    });

    const deleteButtons = document.querySelectorAll(
      'button[title="Delete entry"]',
    );
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(tauri.tauriCommands.deleteHistoryEntry).toHaveBeenCalledWith("1");
    });
  });

  it("does not remove entry when delete reports false", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.deleteHistoryEntry).mockResolvedValue(false);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByText("Summarize"));
    await waitFor(() => screen.getByText("Input"));
    fireEvent.click(document.querySelector('button[title="Delete entry"]')!);

    await waitFor(() =>
      expect(tauri.tauriCommands.deleteHistoryEntry).toHaveBeenCalledWith("1"),
    );
    expect(screen.getByText("Summarize")).toBeInTheDocument();
  });

  it("shows non-Error delete failures", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.deleteHistoryEntry).mockRejectedValue(
      "delete failed",
    );

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByText("Summarize"));
    await waitFor(() => screen.getByText("Input"));
    fireEvent.click(document.querySelector('button[title="Delete entry"]')!);

    await waitFor(() =>
      expect(screen.getByText("delete failed")).toBeInTheDocument(),
    );
  });

  it("shows error when delete fails", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.deleteHistoryEntry).mockRejectedValue(
      new Error("Failed to delete entry"),
    );

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const firstEntry = screen.getByText("Summarize").closest("div");
    fireEvent.click(firstEntry!);

    await waitFor(() => {
      expect(screen.getByText("Input")).toBeInTheDocument();
    });

    const deleteButtons = document.querySelectorAll(
      'button[title="Delete entry"]',
    );
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Failed to delete entry/)).toBeInTheDocument();
    });
  });

  it("toggles star on entry when star button clicked", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.toggleStarEntry).mockResolvedValue(true);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const starButtons = document.querySelectorAll('button[title="Star entry"]');
    expect(starButtons.length).toBeGreaterThan(0);
    fireEvent.click(starButtons[0]);

    await waitFor(() => {
      expect(tauri.tauriCommands.toggleStarEntry).toHaveBeenCalledWith("1");
    });
  });

  it("refreshes history after star toggle to reflect backend side effects", async () => {
    const refreshedHistory = [
      { ...mockHistory[0], starred: true },
      { ...mockHistory[1], starred: false },
    ];
    vi.mocked(tauri.tauriCommands.getHistory)
      .mockResolvedValueOnce(mockHistory)
      .mockResolvedValueOnce(refreshedHistory);
    vi.mocked(tauri.tauriCommands.toggleStarEntry).mockResolvedValue(true);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const starButtons = document.querySelectorAll('button[title="Star entry"]');
    fireEvent.click(starButtons[0]);

    await waitFor(() => {
      expect(tauri.tauriCommands.getHistory).toHaveBeenCalledTimes(2);
      expect(
        document.querySelectorAll('button[title="Unstar entry"]'),
      ).toHaveLength(1);
    });
  });

  it("keeps the optimistic star update and shows no error when the post-toggle refresh fails", async () => {
    vi.mocked(tauri.tauriCommands.getHistory)
      .mockResolvedValueOnce(mockHistory)
      .mockRejectedValueOnce(new Error("refresh failed"));
    vi.mocked(tauri.tauriCommands.toggleStarEntry).mockResolvedValue(true);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    const starButtons = document.querySelectorAll('button[title="Star entry"]');
    fireEvent.click(starButtons[0]);

    await waitFor(() => {
      expect(
        document.querySelectorAll('button[title="Unstar entry"]'),
      ).toHaveLength(2);
    });
    expect(screen.queryByText("refresh failed")).not.toBeInTheDocument();
  });

  it("shows error when star toggle fails", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.toggleStarEntry).mockRejectedValue(
      new Error("star failed"),
    );

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(document.querySelector('button[title="Star entry"]')!);

    await waitFor(() =>
      expect(screen.getByText("star failed")).toBeInTheDocument(),
    );
  });

  it("shows non-Error star toggle failures", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.toggleStarEntry).mockRejectedValue(
      "star failed",
    );

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(document.querySelector('button[title="Star entry"]')!);

    await waitFor(() =>
      expect(screen.getByText("star failed")).toBeInTheDocument(),
    );
  });

  it("does not expand on unrelated keys", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    const entryButton = screen
      .getByText("Summarize")
      .closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(entryButton, { key: "Escape" });

    expect(screen.queryByText("Summary text")).not.toBeInTheDocument();
  });

  it("unstars entry when starred star button clicked", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.toggleStarEntry).mockResolvedValue(false);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Translate")).toBeInTheDocument();
    });

    const unstarButtons = document.querySelectorAll(
      'button[title="Unstar entry"]',
    );
    expect(unstarButtons.length).toBeGreaterThan(0);
    fireEvent.click(unstarButtons[0]);

    await waitFor(() => {
      expect(tauri.tauriCommands.toggleStarEntry).toHaveBeenCalledWith("2");
    });
  });

  it("shows star filter button when starred entries exist", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("filters to starred only when star filter is toggled", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
      expect(screen.getByText("Translate")).toBeInTheDocument();
    });

    const filterButton = screen.getByText("1").closest("button")!;
    fireEvent.click(filterButton);

    await waitFor(() => {
      expect(screen.getByText("Translate")).toBeInTheDocument();
      expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
    });
  });

  it("shows empty starred state when starred entries are removed while filtering", async () => {
    vi.mocked(tauri.tauriCommands.getHistory)
      .mockResolvedValueOnce(mockHistory)
      .mockResolvedValueOnce(
        mockHistory.map((entry) => ({ ...entry, starred: false })),
      );
    vi.mocked(tauri.tauriCommands.toggleStarEntry).mockResolvedValue(false);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Translate"));
    fireEvent.click(screen.getByText("1").closest("button")!);
    fireEvent.click(document.querySelector('button[title="Unstar entry"]')!);

    await waitFor(() =>
      expect(screen.getByText("No starred entries")).toBeInTheDocument(),
    );
  });

  it("toggles expanded state with keyboard", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    const entryButton = screen
      .getByText("Summarize")
      .closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(entryButton, { key: "Enter" });
    expect(screen.getByText("Summary text")).toBeInTheDocument();
    fireEvent.keyDown(entryButton, { key: " " });
    await waitFor(() =>
      expect(screen.queryByText("Summary text")).not.toBeInTheDocument(),
    );
  });

  it("filters history by search query", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.change(screen.getByPlaceholderText(/search action, provider/i), {
      target: { value: "translate" },
    });

    await waitFor(() => {
      expect(screen.getByText("Translate")).toBeInTheDocument();
      expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
    });
  });

  it("filters history to successful entries only", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByRole("button", { name: /success/i }));

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
      expect(screen.queryByText("Translate")).not.toBeInTheDocument();
    });
  });

  it("filters history to failed entries only", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByRole("button", { name: /^failed$/i }));

    await waitFor(() => {
      expect(screen.getByText("Translate")).toBeInTheDocument();
      expect(screen.queryByText("Summarize")).not.toBeInTheDocument();
    });
  });

  it("purges all history including starred entries after confirmation", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.purgeHistory).mockResolvedValue(undefined);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByRole("button", { name: /delete all/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(tauri.tauriCommands.purgeHistory).toHaveBeenCalled();
      expect(
        screen.getByText("All history deleted, including starred entries."),
      ).toBeInTheDocument();
    });
  });

  it("shows no-matching empty state when the search has no results", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.change(screen.getByPlaceholderText(/search action, provider/i), {
      target: { value: "no-such-entry-xyz" },
    });

    await waitFor(() => {
      expect(screen.getByText("No matching entries")).toBeInTheDocument();
      expect(
        screen.getByText("Try adjusting your search or filters."),
      ).toBeInTheDocument();
    });
  });

  it("shows no-matching empty state when the status filter excludes everything", async () => {
    const successOnlyHistory: HistoryEntry[] = [
      {
        id: "1",
        timestamp: "2024-01-01T12:00:00Z",
        actionName: "Summarize",
        providerName: "Anthropic",
        inputText: "test",
        outputText: "output",
        success: true,
        starred: false,
      },
    ];
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(
      successOnlyHistory,
    );

    render(<HistoryList />);

    await waitFor(() => screen.getByText("Summarize"));
    fireEvent.click(screen.getByRole("button", { name: /^failed$/i }));

    await waitFor(() => {
      expect(screen.getByText("No matching entries")).toBeInTheDocument();
      expect(
        screen.getByText("Try adjusting your search or filters."),
      ).toBeInTheDocument();
    });
  });

  it("does not show star filter when no starred entries", async () => {
    const noStarredHistory: HistoryEntry[] = [
      {
        id: "1",
        timestamp: "2024-01-01T12:00:00Z",
        actionName: "Summarize",
        providerName: "Anthropic",
        inputText: "test",
        outputText: "output",
        success: true,
        starred: false,
      },
    ];
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(
      noStarredHistory,
    );

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
