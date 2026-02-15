import { describe, it, expect } from "vitest";
import { boxTop, boxBottom, boxSep, boxLine, boxEmpty, checkMark, warnMark } from "../../src/cli/format.js";

describe("CLI format utilities", () => {
  it("boxTop includes title", () => {
    const result = boxTop("Test Title");
    expect(result).toContain("Test Title");
    expect(result.startsWith("╔")).toBe(true);
    expect(result.endsWith("╗")).toBe(true);
  });

  it("boxBottom is closed", () => {
    const result = boxBottom();
    expect(result.startsWith("╚")).toBe(true);
    expect(result.endsWith("╝")).toBe(true);
  });

  it("boxSep spans full width", () => {
    const result = boxSep();
    expect(result.startsWith("╠")).toBe(true);
    expect(result.endsWith("╣")).toBe(true);
  });

  it("boxLine pads text", () => {
    const result = boxLine("hello");
    expect(result.startsWith("║")).toBe(true);
    expect(result.endsWith("║")).toBe(true);
    expect(result).toContain("hello");
  });

  it("boxEmpty is blank line in box", () => {
    const result = boxEmpty();
    expect(result.startsWith("║")).toBe(true);
    expect(result.trim().replace(/║/g, "").trim()).toBe("");
  });

  it("checkMark returns correct symbols", () => {
    expect(checkMark(true)).toBe("✓");
    expect(checkMark(false)).toBe("✗");
  });

  it("warnMark returns warning symbol", () => {
    expect(warnMark()).toBe("⚠");
  });
});
