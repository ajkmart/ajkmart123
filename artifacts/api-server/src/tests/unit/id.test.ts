import { describe, expect, it } from "vitest";
import { generateId } from "../../lib/id.js";

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("is unique across 10,000 calls (no collision)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(10000);
  });

  it("is exactly 22 characters (padded base-62)", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateId()).toHaveLength(22);
    }
  });

  it("contains only base-62 characters [0-9A-Za-z]", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateId()).toMatch(/^[0-9A-Za-z]{22}$/);
    }
  });

  it("is URL-safe (no special characters)", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateId();
      expect(id).not.toMatch(/[<>"{}|\\^`[\]]/);
    }
  });

  it("is consistent length (all IDs same length)", () => {
    const lengths = new Set<number>();
    for (let i = 0; i < 100; i++) lengths.add(generateId().length);
    expect(lengths.size).toBe(1);
    expect([...lengths][0]).toBe(22);
  });
});
