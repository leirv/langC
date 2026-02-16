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

    // Commands
    expect(paths).toContain(".claude/commands/build-db-users-db.md");
    expect(paths).toContain(".claude/commands/build-api-users.md");
    expect(paths).toContain(".claude/commands/build-webui-users-display.md");
    expect(paths).toContain(".claude/commands/orchestrate.md");

    // Agents
    expect(paths).toContain(".claude/agents/architect.md");
    expect(paths).toContain(".claude/agents/security.md");

    // Rules (from PATTERNS in profiles)
    expect(paths).toContain(".claude/rules/api.md");
    expect(paths).toContain(".claude/rules/webui.md");
    expect(paths).toContain(".claude/rules/db.md");

    // Settings (Stop hook + permissions, no PostToolUse hook scripts)
    expect(paths).toContain(".claude/settings.json");
    expect(paths).not.toContain(".claude/hooks/review-architect.sh");
    expect(paths).not.toContain(".claude/hooks/review-security.sh");

    // Memory
    expect(paths).toContain(".claude/agent-memory/langc/MEMORY.md");

    // LNG rules
    expect(paths).toContain(".claude/rules/postgresql.md");
    expect(paths).toContain(".claude/rules/python.md");
    expect(paths).toContain(".claude/rules/react.md");

    // Plan command
    expect(paths).toContain(".claude/commands/plan.md");
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

    const orchestrate = files.find(f => f.path === ".claude/commands/orchestrate.md")!;
    expect(orchestrate.content).toContain("/build-db-users-db");
    expect(orchestrate.content).toContain("/build-api-users");
    expect(orchestrate.content).toContain("/build-webui-users-display");

    // DB should be in Phase 1
    const phase1Idx = orchestrate.content.indexOf("Phase 1");
    const dbIdx = orchestrate.content.indexOf("/build-db-users-db");
    expect(dbIdx).toBeGreaterThan(phase1Idx);
  });
});
