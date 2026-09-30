import { describe, expect, it } from "vitest";
import { getAppleAvailabilityMessage } from "./appleAvailability";

describe("getAppleAvailabilityMessage", () => {
  it("returns null when availability is missing or ready", () => {
    expect(getAppleAvailabilityMessage(null)).toBeNull();
    expect(
      getAppleAvailabilityMessage({ available: true, reason: null }),
    ).toBeNull();
  });

  it("maps known unavailable reasons", () => {
    expect(
      getAppleAvailabilityMessage({
        available: false,
        reason: "not_enabled",
      }),
    ).toMatch(/not enabled/);
    expect(
      getAppleAvailabilityMessage({
        available: false,
        reason: "not_ready",
      }),
    ).toMatch(/still preparing/);
    expect(
      getAppleAvailabilityMessage({
        available: false,
        reason: "not_supported",
      }),
    ).toMatch(/not supported/);
  });

  it("falls back for unknown reasons", () => {
    expect(
      getAppleAvailabilityMessage({
        available: false,
        reason: "unknown",
      }),
    ).toMatch(/currently unavailable/);
  });
});
