import { describe, it, expect } from "vitest";
import { Compiler } from "../../src/codegen/compiler.js";
import { resolve } from "node:path";

describe("E2E compilation", () => {
  it("produces the complete file tree from test-app.langc", () => {
    const filePath = resolve("examples/test-app.langc");
    const compiler = new Compiler();
    const { files } = compiler.compile(filePath);

    const paths = files.map(f => f.path).sort();

    // Core files
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".langc/state.json");

    // Skills
    expect(paths).toContain(".claude/skills/build-db-users-db/SKILL.md");
    expect(paths).toContain(".claude/skills/build-api-users/SKILL.md");
    expect(paths).toContain(".claude/skills/build-webui-users-display/SKILL.md");
    expect(paths).toContain(".claude/skills/orchestrate/SKILL.md");

    // Agents
    expect(paths).toContain(".claude/agents/architect.md");
    expect(paths).toContain(".claude/agents/security.md");

    // Rules (from PATTERNS in profiles)
    expect(paths).toContain(".claude/rules/api.md");
    expect(paths).toContain(".claude/rules/webui.md");
    expect(paths).toContain(".claude/rules/db.md");

    // Hooks
    expect(paths).toContain(".claude/hooks/review-architect.sh");
    expect(paths).toContain(".claude/hooks/review-security.sh");
    expect(paths).toContain(".claude/settings.json");

    // Memory
    expect(paths).toContain(".claude/agent-memory/langc/MEMORY.md");
  });

  it("CLAUDE.md contains correct dependency order", () => {
    const filePath = resolve("examples/test-app.langc");
    const compiler = new Compiler();
    const { files } = compiler.compile(filePath);

    const claudeMd = files.find(f => f.path === "CLAUDE.md")!;
    const dbIdx = claudeMd.content.indexOf("DB.users-db");
    const apiIdx = claudeMd.content.indexOf("API.users");
    const webuiIdx = claudeMd.content.indexOf("WEBUI.users-display");

    expect(dbIdx).toBeLessThan(apiIdx);
    expect(apiIdx).toBeLessThan(webuiIdx);
  });

  it("orchestrate skill has correct build order", () => {
    const filePath = resolve("examples/test-app.langc");
    const compiler = new Compiler();
    const { files } = compiler.compile(filePath);

    const orchestrate = files.find(f => f.path === ".claude/skills/orchestrate/SKILL.md")!;
    expect(orchestrate.content).toContain("/build-db-users-db");
    expect(orchestrate.content).toContain("/build-api-users");
    expect(orchestrate.content).toContain("/build-webui-users-display");

    // DB should be in Phase 1
    const phase1Idx = orchestrate.content.indexOf("Phase 1");
    const dbIdx = orchestrate.content.indexOf("/build-db-users-db");
    expect(dbIdx).toBeGreaterThan(phase1Idx);
  });
});
