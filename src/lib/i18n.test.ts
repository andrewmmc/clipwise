import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

describe("translate", () => {
  it("returns the English source text by default", () => {
    expect(translate("en", "Settings")).toBe("Settings");
  });

  it("translates Traditional Chinese and interpolates values", () => {
    expect(
      translate("zh-TW", "{{name}} is ready to use.", { name: "Claude" }),
    ).toBe("Claude 已可使用。");
  });

  it("falls back to source text for missing translations", () => {
    expect(translate("zh-TW", "Clipwise")).toBe("Clipwise");
  });
});
