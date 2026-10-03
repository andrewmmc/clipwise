import { describe, expect, it } from "vitest";
import { buildCommandPreview, shellQuote } from "../lib/cliPreview";

describe("CliProviderForm helpers", () => {
  it("leaves simple tokens unquoted", () => {
    expect(shellQuote("--print")).toBe("--print");
    expect(shellQuote("model=sonnet")).toBe("model=sonnet");
  });

  it("quotes empty strings, whitespace, and shell metacharacters", () => {
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("two words")).toBe("'two words'");
    expect(shellQuote("$HOME")).toBe("'$HOME'");
  });

  it("escapes single quotes", () => {
    expect(shellQuote("don't")).toBe("'don'\\''t'");
  });

  it("builds a preview with clean args", () => {
    expect(
      buildCommandPreview(" claude ", [" -p ", "", "--model", "sonnet"]),
    ).toBe("claude -p --model sonnet");
  });

  it("returns an empty preview when command and arguments are empty", () => {
    expect(buildCommandPreview("", [])).toBe("");
  });
});
