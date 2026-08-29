import type { AppleModelAvailability } from "../types/config";
import type { AppLanguage } from "../types/config";
import { translate } from "./i18n";

export function getAppleAvailabilityMessage(
  availability: AppleModelAvailability | null,
  locale: AppLanguage = "en",
): string | null {
  if (!availability || availability.available) return null;

  switch (availability.reason) {
    case "not_enabled":
      return translate(
        locale,
        "Apple Intelligence is available on this Mac but not enabled in system settings.",
      );
    case "not_ready":
      return translate(
        locale,
        "Apple Intelligence is still preparing its on-device model on this Mac.",
      );
    case "not_supported":
      return translate(
        locale,
        "Apple Intelligence is not supported on this Mac.",
      );
    default:
      return translate(
        locale,
        "Apple Intelligence is currently unavailable on this Mac.",
      );
  }
}
