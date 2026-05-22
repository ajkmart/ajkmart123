"use strict";

/**
 * Custom ESLint rule: no-underscore-shorthand-destructure
 *
 * Flags shorthand destructuring where the key starts with `_`:
 *
 *   function Foo({ _propName }) {}          ← reads literal prop "_propName"
 *   const { _toast } = useToast()           ← reads literal prop "_toast"
 *   function Bar({ _foo = defaultVal }) {}  ← same problem with a default
 *
 * In all these cases the developer almost certainly intended the renaming form:
 *
 *   function Foo({ propName: _propName }) {}
 *   const { toast: _toast } = useToast()
 *   function Bar({ foo: _foo = defaultVal }) {}
 *
 * The bare `_` placeholder (e.g. `const { _ } = obj`) is intentionally
 * excluded because it is a well-established "I don't care about this value"
 * convention that carries no mismatch risk.
 *
 * This rule is auto-fixable: it inserts `strippedKey: ` in front of the
 * shorthand, turning `{ _foo }` into `{ foo: _foo }` automatically.
 *
 * Use in eslint.config.mjs (ESM):
 *   import { createRequire } from "module";
 *   const require = createRequire(import.meta.url);
 *   const { rules } = require("./eslint-rules/no-underscore-shorthand-destructure.cjs");
 *
 * Then add to your config:
 *   plugins: { "ajk-local": { rules } }
 *   rules:   { "ajk-local/no-underscore-shorthand-destructure": "error" }
 */

const rule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Disallow underscore-prefixed shorthand destructuring that silently reads a non-existent property",
      recommended: true,
    },
    messages: {
      underscoreShorthand:
        "Shorthand `{{ name }}` reads the literal property `{{ name }}` on the object " +
        "(which likely doesn't exist). " +
        "To rename `{{ stripped }}` to local variable `{{ name }}`, " +
        "use `{{ stripped }}: {{ name }}` instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            description:
              "List of underscore-prefixed names to allow as shorthands (e.g. ['_id'] for MongoDB docs).",
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const allowList = new Set(options.allow || []);

    return {
      Property(node) {
        // Only care about shorthand properties inside destructuring patterns.
        // Shorthand: `{ foo }` — key and value share the same identifier.
        if (!node.shorthand) return;
        if (node.parent.type !== "ObjectPattern") return;

        const key = node.key;
        if (key.type !== "Identifier") return;

        const name = key.name; // e.g. "_toast"

        // Must start with _ but not be exactly "_" (bare placeholder is fine).
        if (!name.startsWith("_") || name === "_") return;

        // Allow-list escape hatch (e.g. MongoDB's _id field).
        if (allowList.has(name)) return;

        const stripped = name.slice(1); // e.g. "toast"
        if (!stripped) return;

        context.report({
          node,
          messageId: "underscoreShorthand",
          data: { name, stripped },
          fix(fixer) {
            // The shorthand property source is `_foo` or `_foo = <default>`.
            // Prepend `strippedKey: ` to produce `foo: _foo` or `foo: _foo = <default>`.
            const src = context.sourceCode
              ? context.sourceCode.getText(node)
              : context.getSourceCode().getText(node);
            return fixer.replaceText(node, `${stripped}: ${src}`);
          },
        });
      },
    };
  },
};

module.exports = { rule, rules: { "no-underscore-shorthand-destructure": rule } };
