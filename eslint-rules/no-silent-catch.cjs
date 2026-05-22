"use strict";

/**
 * Custom ESLint rule: no-silent-catch
 *
 * Flags patterns that silently swallow errors:
 *
 *   somePromise.catch(() => {})         ← empty arrow body
 *   somePromise.catch(() => ({}))       ← arrow returning empty object
 *   somePromise.catch(function() {})    ← empty function expression
 *   try { } catch (e) {}               ← empty catch clause
 *   try { } catch {}                   ← optional-catch-binding, empty body
 *
 * Use in eslint.config.js (ESM):
 *   import { createRequire } from "module";
 *   const require = createRequire(import.meta.url);
 *   const { rules } = require("../../eslint-rules/no-silent-catch.cjs");
 *
 * Use in eslint.config.js (CJS):
 *   const { rules } = require("../../eslint-rules/no-silent-catch.cjs");
 *
 * Then add to your config:
 *   plugins: { "ajk-local": { rules } }
 *   rules:   { "ajk-local/no-silent-catch": "error" }
 */

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow silent .catch() handlers and empty catch blocks that swallow errors without logging",
      recommended: true,
    },
    messages: {
      silentCatch:
        "Silent .catch(() => {}) swallows errors silently. " +
        "Use .catch((err) => { log.warn('…', err); }) so failures are visible.",
      emptyObjectCatch:
        "Silent .catch(() => ({})) returns an empty object on failure, masking the real error. " +
        "Throw or log the error instead.",
      emptyCatchClause:
        "Empty catch block silently swallows errors. " +
        "Add logging (log.warn/log.error) or re-throw the error.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowEmptyObject: {
            type: "boolean",
            description: "When true, .catch(() => ({})) is allowed (not recommended).",
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const allowEmptyObject = options.allowEmptyObject === true;

    function isEmptyBlock(node) {
      return node.type === "BlockStatement" && node.body.length === 0;
    }

    function isEmptyObjectExpression(node) {
      return node.type === "ObjectExpression" && node.properties.length === 0;
    }

    function classifyHandler(arg) {
      if (arg.type !== "ArrowFunctionExpression" && arg.type !== "FunctionExpression") {
        return null;
      }
      // Allow handlers with underscore-prefixed first param (signals intentional silence).
      // e.g. .catch((_e) => {}) or .catch((_e) => ({}))
      const firstParam = arg.params && arg.params[0];
      if (firstParam && firstParam.type === "Identifier" && firstParam.name.startsWith("_")) {
        return null;
      }
      if (isEmptyBlock(arg.body)) return "silentCatch";
      if (!allowEmptyObject && isEmptyObjectExpression(arg.body)) return "emptyObjectCatch";
      return null;
    }

    return {
      // Catches: somePromise.catch(() => {}) / .catch(() => ({})) / .catch(function(){})
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.computed ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "catch" ||
          node.arguments.length === 0
        ) {
          return;
        }

        const msgId = classifyHandler(node.arguments[0]);
        if (msgId) {
          context.report({ node, messageId: msgId });
        }
      },

      // Catches: try { } catch (e) {} and try { } catch {}
      // Exemption: catch (_e) {} — underscore prefix signals intentional silence.
      CatchClause(node) {
        if (!isEmptyBlock(node.body)) return;
        // Allow catch (_e) / catch (_) / catch (_anything) as intentional silences.
        const param = node.param;
        if (param && param.type === "Identifier" && param.name.startsWith("_")) {
          return;
        }
        context.report({ node, messageId: "emptyCatchClause" });
      },
    };
  },
};

module.exports = { rule, rules: { "no-silent-catch": rule } };
