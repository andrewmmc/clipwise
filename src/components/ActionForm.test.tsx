import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);
const { default: ActionForm } = await import("./ActionForm");
import { emptyConfig, mockConfig, mockAction } from "../test/fixtures";

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
    await user.click(screen.getByRole("button", { name: /^save$/i }));
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
    await user.click(screen.getByRole("button", { name: /^save$/i }));
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
    await user.click(screen.getByRole("button", { name: /^save$/i }));

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
    await user.click(screen.getByRole("button", { name: /^save$/i }));

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
    await user.click(screen.getByRole("button", { name: /^save$/i }));

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
      screen.getByPlaceholderText("Leave blank for provider default"),
      "gpt-4o",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

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

  it("clears validation errors when editing fields", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(
      screen.getByText("Name, provider, and prompt are required."),
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("e.g. Refine wording"), "A");
    expect(
      screen.queryByText("Name, provider, and prompt are required."),
    ).not.toBeInTheDocument();
  });

  it("updates provider and model fields", async () => {
    const user = userEvent.setup();
    const config = {
      ...mockConfig,
      providers: [
        ...mockConfig.providers,
        {
          id: "p2",
          name: "OpenAI",
          type: "openai" as const,
          headers: {},
          args: [],
        },
      ],
    };

    render(<ActionForm config={config} onSave={onSave} onCancel={onCancel} />);

    await user.selectOptions(screen.getByRole("combobox"), "p2");
    await user.type(
      screen.getByPlaceholderText("Leave blank for provider default"),
      "gpt-4o",
    );

    expect(screen.getByRole("combobox")).toHaveValue("p2");
    expect(screen.getByDisplayValue("gpt-4o")).toBeInTheDocument();
  });

  it("reset restores initial values", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm
        config={mockConfig}
        initial={{ ...mockAction, model: "claude-3" }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.clear(screen.getByPlaceholderText("e.g. Refine wording"));
    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "Other",
    );
    await user.clear(screen.getByPlaceholderText(/refine this text/i));
    await user.type(screen.getByPlaceholderText(/refine this text/i), "Other");
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.getByDisplayValue("Refine wording")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Improve clarity and grammar"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("claude-3")).toBeInTheDocument();
  });

  it("reset in create mode handles no configured providers", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm config={emptyConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "Other",
    );
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByDisplayValue("Other")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText(/save failed/)).toBeInTheDocument(),
    );
  });

  it("shows non-Error save failures", async () => {
    onSave.mockRejectedValue("save failed");
    const user = userEvent.setup();
    render(
      <ActionForm config={mockConfig} onSave={onSave} onCancel={onCancel} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Refine wording"),
      "Action",
    );
    await user.type(screen.getByPlaceholderText(/refine this text/i), "Prompt");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText("save failed")).toBeInTheDocument(),
    );
  });

  it("tests an action with the default input", async () => {
    mockInvoke.mockResolvedValue("Test result");
    const user = userEvent.setup();
    render(
      <ActionForm
        config={mockConfig}
        initial={mockAction}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^test$/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("test_action", {
        actionId: "a1",
        sampleText: "The quick brown fox jumps over the lazy dog.",
      }),
    );
    expect(screen.getByText("Test result")).toBeInTheDocument();
  });

  it("tests an action with custom input", async () => {
    mockInvoke.mockResolvedValue("Custom result");
    const user = userEvent.setup();
    render(
      <ActionForm
        config={mockConfig}
        initial={mockAction}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.type(screen.getByPlaceholderText("Test input text…"), "Custom");
    await user.click(screen.getByRole("button", { name: /^test$/i }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("test_action", {
        actionId: "a1",
        sampleText: "Custom",
      }),
    );
  });

  it("shows test errors and empty test results", async () => {
    mockInvoke.mockResolvedValueOnce("").mockRejectedValueOnce("boom");
    const user = userEvent.setup();
    render(
      <ActionForm
        config={mockConfig}
        initial={mockAction}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^test$/i }));
    await waitFor(() =>
      expect(screen.getByText("(empty result)")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /^test$/i }));
    await waitFor(() =>
      expect(screen.getByText("Error: boom")).toBeInTheDocument(),
    );
  });

  it("shows Error test failures", async () => {
    mockInvoke.mockRejectedValue(new Error("test failed"));
    const user = userEvent.setup();
    render(
      <ActionForm
        config={mockConfig}
        initial={mockAction}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^test$/i }));

    await waitFor(() =>
      expect(screen.getByText("Error: test failed")).toBeInTheDocument(),
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
