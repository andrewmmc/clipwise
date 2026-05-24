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
