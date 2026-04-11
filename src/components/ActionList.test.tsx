import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const { default: ActionList } = await import("./ActionList");
import { mockConfig, emptyConfig, mockAction } from "../test/fixtures";

describe("ActionList", () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onRefresh.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("shows empty state when there are no actions", () => {
    render(<ActionList config={emptyConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("No actions yet")).toBeInTheDocument();
  });

  // ── List view ─────────────────────────────────────────────────────────────

  it("renders each action's name", () => {
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("Refine wording")).toBeInTheDocument();
  });

  it("renders the resolved provider name", () => {
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText(/Anthropic Claude/)).toBeInTheDocument();
  });

  it("shows 'Unknown provider' when provider id is not found", () => {
    const config = {
      ...mockConfig,
      actions: [{ ...mockAction, providerId: "nonexistent" }],
    };
    render(<ActionList config={config} onRefresh={onRefresh} />);
    expect(screen.getByText(/Unknown provider/)).toBeInTheDocument();
  });

  it("shows model override when action has one", () => {
    const config = {
      ...mockConfig,
      actions: [{ ...mockAction, model: "gpt-4o" }],
    };
    render(<ActionList config={config} onRefresh={onRefresh} />);
    expect(screen.getByText(/gpt-4o/)).toBeInTheDocument();
  });

  it("renders the user prompt text", () => {
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("Improve clarity and grammar")).toBeInTheDocument();
  });

  it("renders the section heading and description", () => {
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(
      screen.getByText(/transform clipboard text via menu bar/i),
    ).toBeInTheDocument();
  });

  // ── Create action ─────────────────────────────────────────────────────────

  it("clicking Add Action shows the ActionForm", async () => {
    const user = userEvent.setup();
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: /add action/i }));
    expect(screen.getByText("New Action")).toBeInTheDocument();
  });

  it("submitting ActionForm calls addAction and onRefresh", async () => {
    mockInvoke.mockResolvedValue({ ...mockAction, id: "new-id" });
    const user = userEvent.setup();
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);

    await user.click(screen.getByRole("button", { name: /add action/i }));
    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "New Action",
    );
    await user.type(screen.getByPlaceholderText(/refine this text/i), "Do it");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("add_action", expect.anything()),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(screen.getByText("Action saved successfully.")).toBeInTheDocument();
  });

  // ── Delete action ─────────────────────────────────────────────────────────

  it("clicking Delete and confirming inline calls deleteAction and onRefresh", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);

    await user.click(screen.getByTitle("Delete"));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("delete_action", { id: "a1" }),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it("clicking Delete but cancelling does not call deleteAction", async () => {
    const user = userEvent.setup();
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);

    await user.click(screen.getByTitle("Delete"));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  // ── Edit action ───────────────────────────────────────────────────────────

  it("clicking Edit shows ActionForm with pre-filled values", async () => {
    const user = userEvent.setup();
    render(<ActionList config={mockConfig} onRefresh={onRefresh} />);
    await user.click(screen.getByTitle("Edit"));
    expect(screen.getByText("Edit Action")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Refine wording")).toBeInTheDocument();
  });
});
