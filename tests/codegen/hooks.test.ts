import { describe, it, expect } from "vitest";
import { HooksGenerator } from "../../src/codegen/generators/hooks.js";
import type { CompilationContext, ResolvedProfile } from "../../src/codegen/types.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(profiles: ResolvedProfile[], blocks: CreateBlock[] = []): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    gate: "phase-by-phase",
    profiles,
    profileExcepts: new Map(),
    blockProfiles: new Map(),
    projectCtx: null,
    blockCtx: new Map(),
    createBlocks: blocks,
    updateBlocks: [],
    dependencyGraph: { nodes: new Map(), order: [], phases: [] },
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("HooksGenerator", () => {
  const gen = new HooksGenerator();

  it("generates only settings.json (no hook scripts)", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [], onReview: ["Flag SQL injection"] },
      { name: "Architect", version: null, role: null, rules: [], patterns: [], onReview: ["Check layer separation"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const paths = files.map(f => f.path);
    expect(paths).toEqual([".claude/settings.json"]);
    expect(paths).not.toContain(".claude/hooks/review-security.sh");
    expect(paths).not.toContain(".claude/hooks/review-architect.sh");
  });

  it("settings.json has Stop hook but no PostToolUse", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [], onReview: ["check"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const settings = files.find(f => f.path === ".claude/settings.json")!;
    const parsed = JSON.parse(settings.content);
    expect(parsed.hooks).toBeDefined();
    expect(parsed.hooks.Stop).toBeInstanceOf(Array);
    expect(parsed.hooks.PostToolUse).toBeUndefined();
  });

  it("Stop hook contains agent type with review prompt", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [], onReview: ["Flag SQL injection"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const parsed = JSON.parse(files.find(f => f.path === ".claude/settings.json")!.content);
    const stopHook = parsed.hooks.Stop[0].hooks[0];
    expect(stopHook.type).toBe("agent");
    expect(stopHook.prompt).toContain("Flag SQL injection");
    expect(stopHook.timeout).toBe(120);
  });

  it("settings.json has permissions", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [], onReview: ["check"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const parsed = JSON.parse(files.find(f => f.path === ".claude/settings.json")!.content);
    expect(parsed.permissions).toBeDefined();
    expect(parsed.permissions.allow).toBeInstanceOf(Array);
    expect(parsed.permissions.deny).toBeInstanceOf(Array);
  });

  it("produces no files when no onReview rules", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Architect", version: null, role: null, rules: ["rule"], patterns: [], onReview: [] },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files).toHaveLength(0);
  });

  it("permissions include project-scoped write access", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [], onReview: ["check"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const parsed = JSON.parse(files.find(f => f.path === ".claude/settings.json")!.content);

    expect(parsed.permissions.allow).toContain("Write(./test-app/**)");
    expect(parsed.permissions.allow).toContain("Edit(./test-app/**)");
    expect(parsed.permissions.allow).toContain("Read(./**)");
  });

  it("permissions deny dangerous operations", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [], onReview: ["check"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    const parsed = JSON.parse(files.find(f => f.path === ".claude/settings.json")!.content);

    expect(parsed.permissions.deny).toContain("Bash(rm -rf *)");
    expect(parsed.permissions.deny).toContain("Write(./.env*)");
  });

  it("permissions include language-specific tool access", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [], onReview: ["check"] },
    ];
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "API", name: "svc",
        properties: [{ kind: "LngProperty", value: "python", loc }],
        members: [], loc,
      },
    ];

    const files = gen.generate(makeCtx(profiles, blocks));
    const parsed = JSON.parse(files.find(f => f.path === ".claude/settings.json")!.content);

    expect(parsed.permissions.allow).toContain("Bash(pytest *)");
    expect(parsed.permissions.allow).toContain("Bash(ruff check *)");
  });
});
