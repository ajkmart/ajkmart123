import { createLogger } from "@/lib/logger";
const log = createLogger("[sanitizeMarkerHtml]");

const ALLOWED_TAGS = new Set([
  "div",
  "span",
  "img",
  "svg",
  "g",
  "circle",
  "rect",
  "path",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "text",
  "tspan",
  "title",
  "defs",
]);

const ALLOWED_ATTRS = new Set([
  "style",
  "class",
  "width",
  "height",
  "viewbox",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "src",
  "alt",
  "xmlns",
  "preserveaspectratio",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dy",
]);

const UNSAFE_VALUE = /(javascript:|vbscript:|data:text\/html|expression\s*\()/i;

function sanitizeNode(node: Element): void {
  Array.from(node.children).forEach(sanitizeNode);

  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    const parent = node.parentNode;
    if (parent) {
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      parent.removeChild(node);
    }
    return;
  }

  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || !ALLOWED_ATTRS.has(name) || UNSAFE_VALUE.test(attr.value)) {
      node.removeAttribute(attr.name);
    }
  }
}

export function sanitizeMarkerHtml(raw: string): string {
  if (!raw) return "";
  if (typeof DOMParser === "undefined") {
    return raw.replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch] as string
    );
  }
  try {
    const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return "";
    sanitizeNode(root);
    return root.innerHTML;
  } catch (err) {
    log.error("parse failed:", err);
    return "";
  }
}
