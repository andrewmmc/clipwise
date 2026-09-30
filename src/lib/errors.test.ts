import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("returns Error.message", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns a thrown string", () => {
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });

  it("stringifies objects whose message is not a string", () => {
    expect(getErrorMessage({ message: { code: 1 } })).toBe(
      "[object Object]",
    );
  });
});
