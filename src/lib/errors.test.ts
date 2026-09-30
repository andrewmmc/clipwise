import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("returns Error.message", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns a thrown string", () => {
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });

  it("falls back when message is empty, whitespace, or missing", () => {
    expect(getErrorMessage({ message: "  " })).toBe("[object Object]");
    expect(getErrorMessage("   ")).toBe("   ");
    expect(getErrorMessage(42)).toBe("42");
  });
});
