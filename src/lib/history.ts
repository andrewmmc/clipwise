import type { AppLanguage } from "../types/config";

export function formatHistoryTimestamp(
  timestamp: string,
  locale: AppLanguage = "en",
) {
  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat(locale === "zh-TW" ? "zh-TW" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return timestamp;
  }
}
