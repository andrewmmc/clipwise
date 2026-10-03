import { describe, expect, it } from "vitest";
import { formatHistoryTimestamp } from "./history";

describe("formatHistoryTimestamp", () => {
  it("formats a valid ISO timestamp", () => {
    const result = formatHistoryTimestamp("2024-01-01T12:00:00Z");
    expect(result).toMatch(/Jan 1/);
  });

  it("falls back to the raw string when the timestamp can't be formatted", () => {
    const result = formatHistoryTimestamp("not-a-timestamp");
    expect(result).toBe("not-a-timestamp");
  });
});
