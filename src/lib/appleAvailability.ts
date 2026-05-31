import type { AppleModelAvailability } from "../types/config";

export function getAppleAvailabilityMessage(
  availability: AppleModelAvailability | null,
): string | null {
  if (!availability || availability.available) return null;

  switch (availability.reason) {
    case "not_enabled":
      return "Apple Intelligence is available on this Mac but not enabled in system settings.";
    case "not_ready":
      return "Apple Intelligence is still preparing its on-device model on this Mac.";
    case "not_supported":
      return "Apple Intelligence is not supported on this Mac.";
    default:
      return "Apple Intelligence is currently unavailable on this Mac.";
  }
}
