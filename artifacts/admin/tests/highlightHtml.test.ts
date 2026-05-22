import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/lib/escapeHtml";

/**
 * Mirrors the exact escaping pipeline used by `CommandPalette.tsx`'s
 * `Highlight` component so we can assert the XSS-safe contract without
 * pulling React + jsdom into this suite. Keep the implementation in
 * lockstep with `Highlight`: any change there must be mirrored here.
 */
function buildHighlightHtml(text: string, query: string): string {
  if (!query || query.length < 2) return escapeHtml(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return escapeHtml(text);
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">${match}</mark>${after}`;
}

describe("CommandPalette Highlight HTML pipeline", () => {
  it("escapes <script> in the source text even when it does not match", () => {
    const html = buildHighlightHtml("<script>alert(1)</script>order", "ord");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">ord</mark>');
  });

  it("escapes <script> when it appears inside the matched slice", () => {
    const html = buildHighlightHtml("safe<script>x</script>tail", "<script>");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toMatch(/<mark[^>]*>&lt;script&gt;<\/mark>/);
  });

  it("escapes attribute-breaker quotes in the matched slice", () => {
    const html = buildHighlightHtml(`he said "hi" to her`, `"hi"`);
    expect(html).toContain("&quot;hi&quot;");
    expect(html).not.toMatch(/<mark[^>]*>"hi"<\/mark>/);
  });

  it("returns escaped plain text when query is shorter than 2 chars", () => {
    expect(buildHighlightHtml("<b>bold</b>", "")).toBe("&lt;b&gt;bold&lt;/b&gt;");
    expect(buildHighlightHtml("<b>bold</b>", "x")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("returns escaped plain text when there is no substring match", () => {
    expect(buildHighlightHtml("<i>none</i>", "zzz")).toBe("&lt;i&gt;none&lt;/i&gt;");
  });

  it("only emits the literal <mark> tag we control as raw HTML", () => {
    const html = buildHighlightHtml("alpha BETA gamma", "beta");
    const tagMatches = html.match(/<[^>]+>/g) ?? [];
    expect(tagMatches).toEqual([
      '<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">',
      "</mark>",
    ]);
  });
});
