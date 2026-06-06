import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/tauri", () => ({
  tauriCommands: {
    testAction: vi.fn(),
  },
}));

const { tauriCommands } = await import("../lib/tauri");
const { default: ActionRunner } = await import("./ActionRunner");
import { mockConfig, emptyConfig } from "../test/fixtures";

const mockTestAction = vi.mocked(tauriCommands.testAction);

describe("ActionRunner", () => {
  const onNavigateToActions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("renders text input and action buttons", () => {
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    expect(
      screen.getByPlaceholderText(/paste or type the text/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refine wording/i }),
    ).toBeInTheDocument();
  });

  it("shows empty state when no actions configured", () => {
    render(
      <ActionRunner config={emptyConfig} onNavigateToActions={onNavigateToActions} />,
    );
    expect(screen.getByText("No actions configured")).toBeInTheDocument();
    expect(
      screen.getByText(/create actions in the actions tab/i),
    ).toBeInTheDocument();
  });

  it("disables action buttons when input is empty", () => {
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    expect(
      screen.getByRole("button", { name: /refine wording/i }),
    ).toBeDisabled();
  });

  it("enables action buttons when input has text", async () => {
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/paste or type the text/i),
      "Hello world",
    );
    expect(
      screen.getByRole("button", { name: /refine wording/i }),
    ).toBeEnabled();
  });

  it("runs an action and shows the result", async () => {
    mockTestAction.mockResolvedValue("Improved text");
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText(/paste or type the text/i),
      "Hello world",
    );
    await user.click(
      screen.getByRole("button", { name: /refine wording/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("Improved text")).toBeInTheDocument(),
    );
    expect(mockTestAction).toHaveBeenCalledWith("a1", "Hello world");
  });

  it("shows error result when action fails", async () => {
    mockTestAction.mockRejectedValue(new Error("API error"));
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText(/paste or type the text/i),
      "Hello world",
    );
    await user.click(
      screen.getByRole("button", { name: /refine wording/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("API error")).toBeInTheDocument(),
    );
  });

  it("shows running state while action is pending", async () => {
    let resolve: (value: string) => void;
    mockTestAction.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText(/paste or type the text/i),
      "Hello world",
    );
    await user.click(
      screen.getByRole("button", { name: /refine wording/i }),
    );

    expect(screen.getByText("Running…")).toBeInTheDocument();

    resolve!("Done");
    await waitFor(() =>
      expect(screen.queryByText("Running…")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("clears results when Clear button is clicked", async () => {
    mockTestAction.mockResolvedValue("Result text");
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText(/paste or type the text/i),
      "Hello",
    );
    await user.click(
      screen.getByRole("button", { name: /refine wording/i }),
    );

    await waitFor(() => screen.getByText("Result text"));
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByText("Result text")).not.toBeInTheDocument();
  });

  it("calls onNavigateToActions when manage actions button clicked", async () => {
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTitle("Manage actions"));
    expect(onNavigateToActions).toHaveBeenCalledOnce();
  });

  it("does not run action when input is only whitespace", async () => {
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/paste or type the text/i),
      "   ",
    );
    expect(
      screen.getByRole("button", { name: /refine wording/i }),
    ).toBeDisabled();
  });

  it("accumulates multiple results", async () => {
    mockTestAction
      .mockResolvedValueOnce("First result")
      .mockResolvedValueOnce("Second result");
    render(
      <ActionRunner config={mockConfig} onNavigateToActions={onNavigateToActions} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText(/paste or type the text/i),
      "Hello",
    );

    const actionBtn = screen.getByRole("button", { name: /refine wording/i });
    await user.click(actionBtn);
    await waitFor(() => screen.getByText("First result"));

    await user.click(actionBtn);
    await waitFor(() => screen.getByText("Second result"));

    expect(screen.getByText("First result")).toBeInTheDocument();
    expect(screen.getByText("Second result")).toBeInTheDocument();
  });
});
