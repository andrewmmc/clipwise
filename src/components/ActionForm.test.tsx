import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const { default: ActionForm } = await import("./ActionForm");
import { mockConfig, mockAction } from "../test/fixtures";

describe("ActionForm", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockReset();
    onCancel.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it("shows 'New Action' heading in create mode", () => {
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );
    expect(screen.getByText("New Action")).toBeInTheDocument();
  });

  it("shows 'Edit Action' heading in edit mode", () => {
    render(
      <ActionForm
        config={mockConfig}
        initial={mockAction}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Edit Action")).toBeInTheDocument();
  });

  it("pre-fills name field from initial prop", () => {
    render(
      <ActionForm
        config={mockConfig}
        initial={mockAction}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByDisplayValue("Refine wording")).toBeInTheDocument();
  });

  it("pre-fills user prompt field from initial prop", () => {
    render(
      <ActionForm
        config={mockConfig}
        initial={mockAction}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.getByDisplayValue("Improve clarity and grammar"),
    ).toBeInTheDocument();
  });

  it("pre-fills model override field when initial has model", () => {
    const actionWithModel = { ...mockAction, model: "gpt-4o" };
    render(
      <ActionForm
        config={mockConfig}
        initial={actionWithModel}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByDisplayValue("gpt-4o")).toBeInTheDocument();
  });

  it("renders provider options from config", () => {
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );
    expect(
      screen.getByText("Anthropic Claude (anthropic)"),
    ).toBeInTheDocument();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("shows validation error when name is empty on submit", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: /save action/i }));
    expect(
      screen.getByText("Name, provider, and prompt are required."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows validation error when user prompt is empty on submit", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );
    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "My Action",
    );
    await user.click(screen.getByRole("button", { name: /save action/i }));
    expect(
      screen.getByText("Name, provider, and prompt are required."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects prompts longer than the character limit", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "My Action",
    );
    fireEvent.change(screen.getByPlaceholderText(/refine this text/i), {
      target: { value: "x".repeat(2001) },
    });
    await user.click(screen.getByRole("button", { name: /save action/i }));

    expect(
      screen.getByText("User prompt must be 2000 characters or fewer."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // ── Successful submission ─────────────────────────────────────────────────

  it("calls onSave with trimmed name and prompt", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "  My Action  ",
    );
    await user.type(
      screen.getByPlaceholderText(/refine this text/i),
      "  Do the thing  ",
    );
    await user.click(screen.getByRole("button", { name: /save action/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Action",
          userPrompt: "Do the thing",
        }),
      ),
    );
  });

  it("omits model field from payload when model input is blank", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "Action",
    );
    await user.type(screen.getByPlaceholderText(/refine this text/i), "Prompt");
    await user.click(screen.getByRole("button", { name: /save action/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ model: undefined }),
      ),
    );
  });

  it("includes model in payload when model input is filled", async () => {
    onSave.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "Action",
    );
    await user.type(screen.getByPlaceholderText(/refine this text/i), "Prompt");
    await user.type(
      screen.getByPlaceholderText("Leave blank to use provider default"),
      "gpt-4o",
    );
    await user.click(screen.getByRole("button", { name: /save action/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o" }),
      ),
    );
  });

  it("shows the prompt character count", () => {
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );
    expect(screen.getByText("0/2000")).toBeInTheDocument();
  });

  it("shows error message when onSave throws", async () => {
    onSave.mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "Action",
    );
    await user.type(screen.getByPlaceholderText(/refine this text/i), "Prompt");
    await user.click(screen.getByRole("button", { name: /save action/i }));

    await waitFor(() =>
      expect(screen.getByText(/save failed/)).toBeInTheDocument(),
    );
  });

  // ── Cancel ────────────────────────────────────────────────────────────────

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
