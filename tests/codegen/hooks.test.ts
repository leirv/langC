import { describe, it, expect } from "vitest";
import { HooksGenerator } from "../../src/codegen/generators/hooks.js";
import type { CompilationContext, ResolvedProfile } from "../../src/codegen/types.js";

const loc = { line: 1, column: 1 };

function makeCtx(profiles: ResolvedProfile[]): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    profiles,
    profileExcepts: new Map(),
    createBlocks: [],
    updateBlocks: [],
    dependencyGraph: { nodes: new Map(), order: [], phases: [] },
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("HooksGenerator", () => {
  const gen = new HooksGenerator();

  it("generates hook script per profile with onReview", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", role: null, rules: [], patterns: [], onReview: ["Flag SQL injection"] },
      { name: "Architect", role: null, rules: [], patterns: [], onReview: ["Check layer separation"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const paths = files.map(f => f.path);
    expect(paths).toContain(".claude/hooks/review-security.sh");
    expect(paths).toContain(".claude/hooks/review-architect.sh");
    expect(paths).toContain(".claude/settings.json");
  });

  it("hook scripts are bash with shebang", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", role: null, rules: [], patterns: [], onReview: ["Flag issues"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const hook = files.find(f => f.path.endsWith(".sh"))!;
    expect(hook.content).toMatch(/^#!/);
    expect(hook.content).toContain("Security profile ON_REVIEW");
  });

  it("settings.json is valid JSON", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", role: null, rules: [], patterns: [], onReview: ["check"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const settings = files.find(f => f.path === ".claude/settings.json")!;
    const parsed = JSON.parse(settings.content);
    expect(parsed.hooks).toBeDefined();
    expect(parsed.hooks.PostToolUse).toBeInstanceOf(Array);
    expect(parsed.hooks.Stop).toBeInstanceOf(Array);
  });

  it("settings.json references hook scripts", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", role: null, rules: [], patterns: [], onReview: ["check"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const settings = files.find(f => f.path === ".claude/settings.json")!;
    const parsed = JSON.parse(settings.content);
    const command = parsed.hooks.PostToolUse[0].hooks[0].command;
    expect(command).toContain("review-security.sh");
  });

  it("produces no files when no onReview rules", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Architect", role: null, rules: ["rule"], patterns: [], onReview: [] },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files).toHaveLength(0);
  });
});
