import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RunResultCard, { type RunResult } from "./RunResultCard";

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
});

describe("RunResultCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  const successResult: RunResult = {
    id: "r1",
    actionName: "Refine wording",
    inputText: "Hello world",
    outputText: "Improved text",
    success: true,
    pending: false,
  };

  const errorResult: RunResult = {
    id: "r2",
    actionName: "Translate",
    inputText: "Hello",
    outputText: "API error",
    success: false,
    pending: false,
  };

  const pendingResult: RunResult = {
    id: "r3",
    actionName: "Summarize",
    inputText: "Long text",
    outputText: "",
    success: true,
    pending: true,
  };

  it("renders successful result with output and copy button", () => {
    render(<RunResultCard result={successResult} />);
    expect(screen.getByText("Refine wording")).toBeInTheDocument();
    expect(screen.getByText("Improved text")).toBeInTheDocument();
    expect(screen.getByTitle("Copy output")).toBeInTheDocument();
  });

  it("renders error result with error styling", () => {
    render(<RunResultCard result={errorResult} />);
    expect(screen.getByText("Translate")).toBeInTheDocument();
    expect(screen.getByText("API error")).toBeInTheDocument();
    expect(screen.queryByTitle("Copy output")).not.toBeInTheDocument();
  });

  it("renders pending result with running indicator", () => {
    render(<RunResultCard result={pendingResult} />);
    expect(screen.getByText("Summarize")).toBeInTheDocument();
    expect(screen.getByText("Running…")).toBeInTheDocument();
    expect(screen.queryByTitle("Copy output")).not.toBeInTheDocument();
  });

  it("copies output text to clipboard when Copy clicked", async () => {
    const mockWriteText = vi.mocked(navigator.clipboard.writeText);
    render(<RunResultCard result={successResult} />);
    fireEvent.click(screen.getByTitle("Copy output"));
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith("Improved text");
    });
  });

  it("toggles expanded state on click", async () => {
    render(<RunResultCard result={successResult} />);
    expect(screen.getByText("Improved text")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /collapse result/i }),
    );
    expect(screen.queryByText("Improved text")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand result/i }));
    expect(screen.getByText("Improved text")).toBeInTheDocument();
  });

  it("does not show toggle button when pending", () => {
    render(<RunResultCard result={pendingResult} />);
    expect(
      screen.queryByRole("button", { name: /collapse/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /expand/i }),
    ).not.toBeInTheDocument();
  });
});
