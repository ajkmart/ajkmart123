import { describe, expect, it } from "vitest";
import { safeJsonParse, safeJsonStringify, safeJsonStringifyPretty } from "../src/lib/safeJson";

describe("safeJsonStringifyPretty", () => {
  it("pretty-prints simple values", () => {
    const out = safeJsonStringifyPretty({ a: 1, b: "two" });
    expect(out).toBe('{\n  "a": 1,\n  "b": "two"\n}');
  });

  it("returns the supplied fallback for circular structures", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(safeJsonStringifyPretty(obj, "FALLBACK")).toBe("FALLBACK");
  });

  it("serializes arrays", () => {
    const out = safeJsonStringifyPretty([1, 2, { x: "y" }]);
    expect(out).toContain('"x": "y"');
  });
});

describe("safeJsonStringify", () => {
  it("returns compact JSON", () => {
    expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
  });

  it("returns fallback for circular references", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(safeJsonStringify(obj, "FB")).toBe("FB");
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  it("returns fallback on parse failure", () => {
    expect(safeJsonParse<number>("not json", 42)).toBe(42);
  });

  it("returns fallback on empty/null/undefined input", () => {
    expect(safeJsonParse<string>("", "x")).toBe("x");
    expect(safeJsonParse<string>(null, "x")).toBe("x");
    expect(safeJsonParse<string>(undefined, "x")).toBe("x");
  });
});
