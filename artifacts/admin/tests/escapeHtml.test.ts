import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/lib/escapeHtml";

describe("escapeHtml", () => {
  it("encodes the standard XSS-relevant characters", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"
    );
  });

  it("encodes ampersand before other entities so output is reversible", () => {
    expect(escapeHtml("&lt;already&gt;")).toBe("&amp;lt;already&amp;gt;");
  });

  it("preserves a string with no special characters", () => {
    expect(escapeHtml("plain text 123")).toBe("plain text 123");
  });

  it("returns an empty string for an empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("encodes both quote styles", () => {
    expect(escapeHtml(`hello "world" 'quotes'`)).toBe("hello &quot;world&quot; &#39;quotes&#39;");
  });
});
