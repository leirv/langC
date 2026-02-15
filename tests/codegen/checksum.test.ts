import { describe, it, expect } from "vitest";
import { computeChecksum, computeComponentChecksum } from "../../src/codegen/checksum.js";

describe("checksum", () => {
  it("returns a 12-char hex string", () => {
    const result = computeChecksum("hello world");
    expect(result).toMatch(/^[a-f0-9]{12}$/);
  });

  it("is deterministic", () => {
    expect(computeChecksum("test")).toBe(computeChecksum("test"));
  });

  it("differs for different inputs", () => {
    expect(computeChecksum("a")).not.toBe(computeChecksum("b"));
  });

  it("computeComponentChecksum combines multiple files", () => {
    const result = computeComponentChecksum(["file1", "file2"]);
    expect(result).toMatch(/^[a-f0-9]{12}$/);
  });

  it("computeComponentChecksum is order-independent", () => {
    const a = computeComponentChecksum(["file1", "file2"]);
    const b = computeComponentChecksum(["file2", "file1"]);
    expect(a).toBe(b);
  });
});
