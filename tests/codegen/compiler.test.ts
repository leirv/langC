import { describe, it, expect } from "vitest";
import { Compiler } from "../../src/codegen/compiler.js";
import { resolve } from "node:path";

describe("Compiler", () => {
  it("compiles test-app.langc end-to-end", () => {
    const filePath = resolve("examples/test-app.langc");
    const compiler = new Compiler();
    const { files, context } = compiler.compile(filePath);

    // Should produce CLAUDE.md + 3 create skills
    expect(files.length).toBeGreaterThanOrEqual(4);

    const paths = files.map(f => f.path);
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".claude/skills/build-db-users-db/SKILL.md");
    expect(paths).toContain(".claude/skills/build-api-users/SKILL.md");
    expect(paths).toContain(".claude/skills/build-webui-users-display/SKILL.md");

    // Context checks
    expect(context.projectName).toBe("test-app");
    expect(context.scope).toBe("full");
    expect(context.createBlocks).toHaveLength(3);
  });

  it("resolves imports from profile files", () => {
    const filePath = resolve("examples/test-app.langc");
    const compiler = new Compiler();
    const { context } = compiler.compile(filePath);

    // Should have resolved Architect and Security profiles
    expect(context.profiles).toHaveLength(2);
    expect(context.profiles[0].name).toBe("Architect");
    expect(context.profiles[1].name).toBe("Security");
    expect(context.profiles[0].rules.length).toBeGreaterThan(0);
  });

  it("builds correct dependency graph", () => {
    const filePath = resolve("examples/test-app.langc");
    const compiler = new Compiler();
    const { context } = compiler.compile(filePath);

    expect(context.dependencyGraph.order).toEqual([
      "DB.users-db",
      "API.users",
      "WEBUI.users-display",
    ]);
  });
});
