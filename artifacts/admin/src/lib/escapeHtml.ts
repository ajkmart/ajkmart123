/**
 * escapeHtml — escapes the five characters that are unsafe inside HTML
 * markup. Intended for values that flow into `dangerouslySetInnerHTML`
 * (Leaflet/Mapbox marker labels, chart CSS variable keys, etc.).
 */
export function escapeHtml(input: unknown): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * isSafeCssColor — accepts only the narrow set of CSS color forms we ever
 * emit from chart configs. Used to reject anything that could break out of
 * a `--var: <value>;` declaration when injected via a `<style>` block.
 *
 * Allowed forms:
 *   - #rgb / #rrggbb / #rrggbbaa
 *   - rgb()/rgba()/hsl()/hsla() with simple numeric/percent arguments
 *   - hsl with `deg` units
 *   - basic CSS color keywords (letters only, optional `var(--name)`)
 */
const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_HSL_RE =
  /^(?:rgb|rgba|hsl|hsla)\(\s*-?\d+(?:\.\d+)?(?:%|deg)?\s*(?:,\s*-?\d+(?:\.\d+)?(?:%|deg)?\s*){2,3}\)$/;
const KEYWORD_RE = /^[a-zA-Z]+$/;
const CSS_VAR_RE = /^var\(--[a-zA-Z0-9_-]+\)$/;

export function isSafeCssColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  return HEX_RE.test(v) || RGB_HSL_RE.test(v) || KEYWORD_RE.test(v) || CSS_VAR_RE.test(v);
}

/** Identifier safe for use as a CSS custom property name suffix. */
const CSS_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
export function isSafeCssIdent(value: unknown): value is string {
  return typeof value === "string" && CSS_IDENT_RE.test(value);
}
