import { describe, expect, it } from "vitest";
import { normalizePhoneFormatPattern } from "../lib/phone-format.js";

describe("normalizePhoneFormatPattern", () => {
  it("returns the safe default for an invalid placeholder pattern", () => {
    expect(normalizePhoneFormatPattern("+92XXXXXXXXXX")).toBe("^0?3\\d{9}$");
  });

  it("preserves safe, compilable patterns", () => {
    expect(normalizePhoneFormatPattern("^0?3\\d{9}$")).toBe("^0?3\\d{9}$");
  });
});
