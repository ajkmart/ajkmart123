// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeMarkerHtml } from "../src/lib/sanitizeMarkerHtml";

/**
 * sanitizeMarkerHtml strips disallowed tags and attrs but preserves
 * allow-listed structural tags. The XSS-relevant invariants are: no
 * executable tag/attr ever survives, and benign tags from the
 * allow-list (div/span/svg/etc) keep their structure.
 *
 * jsdom is required because the helper relies on DOMParser; without it
 * it falls back to escaping everything (covered by the no-DOM helper
 * test in escapeHtml).
 */
describe("sanitizeMarkerHtml", () => {
  it("strips raw <script> tags", () => {
    const out = sanitizeMarkerHtml("<div>ok<script>x</script></div>");
    expect(out).not.toContain("<script");
  });

  it("strips inline event handler attributes", () => {
    const out = sanitizeMarkerHtml('<div onclick="evil()">x</div>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("evil()");
  });

  it("strips javascript: URLs from attributes", () => {
    const out = sanitizeMarkerHtml('<img src="javascript:alert(1)">');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("preserves allow-listed structural tags", () => {
    const out = sanitizeMarkerHtml('<div class="m"><span>Hello</span></div>');
    expect(out).toContain("<span");
    expect(out).toContain("Hello");
  });

  it("preserves SVG marker shapes", () => {
    const out = sanitizeMarkerHtml(
      '<svg width="20" height="20"><circle cx="10" cy="10" r="5"></circle></svg>'
    );
    expect(out).toContain("<svg");
    expect(out).toContain("<circle");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeMarkerHtml("")).toBe("");
  });
});
