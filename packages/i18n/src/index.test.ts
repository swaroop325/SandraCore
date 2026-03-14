import { describe, it, expect } from "vitest";
import { t, getSupportedLocales } from "./index.js";

describe("t()", () => {
  it("returns English translation", () => {
    expect(t("en", "pairing_required")).toContain("pairing code");
  });

  it("returns Hindi translation", () => {
    expect(t("hi", "pairing_required")).toContain("pairing code");
  });

  it("interpolates variables", () => {
    const result = t("en", "task_created", { title: "Send proposal" });
    expect(result).toContain("Send proposal");
  });

  it("falls back to key when translation missing", () => {
    expect(t("en", "nonexistent_key")).toBe("nonexistent_key");
  });

  it("falls back to English for unknown locale", () => {
    const result = t("fr", "pairing_required");
    expect(result).toContain("pairing code");
  });

  it("getSupportedLocales returns at least en and hi", () => {
    const locales = getSupportedLocales();
    expect(locales).toContain("en");
    expect(locales).toContain("hi");
  });
});
