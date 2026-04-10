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

// Mock tauri commands
vi.mock("../lib/tauri", () => ({
  tauriCommands: {
    getHistory: vi.fn(),
    clearHistory: vi.fn(),
    deleteHistoryEntry: vi.fn(),
  },
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

// Mock confirm
global.confirm = vi.fn(() => true);

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
    },
    {
      id: "2",
      timestamp: "2024-01-01T11:00:00Z",
      actionName: "Translate",
      providerName: "OpenAI",
      inputText: "Hello world",
      outputText: "Error: API key invalid",
      success: false,
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
      () => new Promise(() => {}), // Never resolves
    );

    const { container } = render(<HistoryList />);
    expect(container.textContent).toContain("Loading history");
  });

  it("displays empty state when no history", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue([]);

    render(<HistoryList />);

    await waitFor(() => {
      expect(
        screen.getByText(/No transformations recorded yet/),
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
      expect(screen.getByText("2 transformations logged.")).toBeInTheDocument();
    });
  });

  it("shows success and failure indicators", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    const { container } = render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    // Check for green circle check icon (success)
    const checkIcons = container.querySelectorAll("svg.lucide-circle-check");
    expect(checkIcons.length).toBeGreaterThan(0);

    // Check for red x circle icon (failure)
    const errorIcons = container.querySelectorAll("svg.lucide-circle-x");
    expect(errorIcons.length).toBeGreaterThan(0);
  });

  it("expands entry when clicked", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);

    const { container } = render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    // Click the first entry's button
    const buttons = container.querySelectorAll("button");
    const firstEntryButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Summarize"),
    );
    expect(firstEntryButton).toBeDefined();
    fireEvent.click(firstEntryButton!);

    // After expanding, full input and output should be visible
    await waitFor(() => {
      expect(screen.getByText("Summary text")).toBeInTheDocument();
    });
  });

  it("clears history after confirmation", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(tauri.tauriCommands.clearHistory).mockResolvedValue(undefined);
    vi.mocked(global.confirm).mockReturnValueOnce(true);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Clear History")).toBeInTheDocument();
    });

    const clearButton = screen.getByText("Clear History");
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(tauri.tauriCommands.clearHistory).toHaveBeenCalled();
    });
  });

  it("does not clear history when confirmation cancelled", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    vi.mocked(global.confirm).mockReturnValueOnce(false);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Clear History")).toBeInTheDocument();
    });

    const clearButton = screen.getByText("Clear History");
    fireEvent.click(clearButton);

    expect(tauri.tauriCommands.clearHistory).not.toHaveBeenCalled();
  });

  it("copies input to clipboard", async () => {
    vi.mocked(tauri.tauriCommands.getHistory).mockResolvedValue(mockHistory);
    const mockWriteText = vi.mocked(navigator.clipboard.writeText);

    const { container } = render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    // Expand entry first
    const buttons = container.querySelectorAll("button");
    const firstEntryButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Summarize"),
    );
    fireEvent.click(firstEntryButton!);

    await waitFor(() => {
      const copyButtons = screen.getAllByText("Copy");
      expect(copyButtons.length).toBeGreaterThan(0);
    });

    // Click the first copy button (for input)
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

    const { container } = render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    // Expand entry to show delete button
    const buttons = container.querySelectorAll("button");
    const firstEntryButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Summarize"),
    );
    fireEvent.click(firstEntryButton!);

    await waitFor(() => {
      expect(screen.getByText("Input")).toBeInTheDocument();
    });

    // Find and click delete button (Trash2 icon)
    const deleteButtons = container.querySelectorAll(
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
    vi.mocked(tauri.tauriCommands.deleteHistoryEntry).mockResolvedValue(false);

    const { container } = render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText("Summarize")).toBeInTheDocument();
    });

    // Expand entry to show delete button
    const buttons = container.querySelectorAll("button");
    const firstEntryButton = Array.from(buttons).find((b) =>
      b.textContent?.includes("Summarize"),
    );
    fireEvent.click(firstEntryButton!);

    await waitFor(() => {
      expect(screen.getByText("Input")).toBeInTheDocument();
    });

    // Click delete button
    const deleteButtons = container.querySelectorAll(
      'button[title="Delete entry"]',
    );
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });
});
