import { describe, it, expect } from "vitest";
import { AgentGenerator } from "../../src/codegen/generators/agent.js";
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

describe("AgentGenerator", () => {
  const gen = new AgentGenerator();

  it("generates one agent file per profile", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Architect", role: "Senior Architect", rules: ["rule1"], patterns: [], onReview: [] },
      { name: "Security", role: "Security Engineer", rules: ["rule2"], patterns: [], onReview: [] },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe(".claude/agents/architect.md");
    expect(files[1].path).toBe(".claude/agents/security.md");
  });

  it("includes YAML frontmatter with role", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Architect", role: "Senior Software Architect", rules: [], patterns: [], onReview: [] },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files[0].content).toMatch(/^---\n/);
    expect(files[0].content).toContain("name: architect");
    expect(files[0].content).toContain("Senior Software Architect");
    expect(files[0].content).toContain("tools: Read, Glob, Grep");
    expect(files[0].content).toContain("disallowedTools: Write, Edit, Bash");
  });

  it("includes rules section", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Architect", role: null, rules: ["Separate concerns", "Use DI"], patterns: [], onReview: [] },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files[0].content).toContain("# Rules You Enforce");
    expect(files[0].content).toContain("- Separate concerns");
    expect(files[0].content).toContain("- Use DI");
  });

  it("includes patterns section", () => {
    const profiles: ResolvedProfile[] = [
      {
        name: "Architect", role: null, rules: [],
        patterns: [{ componentType: "API", pattern: "router/ services/ models/" }],
        onReview: [],
      },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files[0].content).toContain("# Structural Patterns");
    expect(files[0].content).toContain("`router/`");
    expect(files[0].content).toContain("`services/`");
  });

  it("includes review checklist", () => {
    const profiles: ResolvedProfile[] = [
      { name: "Security", role: null, rules: [], patterns: [], onReview: ["Flag SQL injection", "Check auth"] },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files[0].content).toContain("# Review Checklist");
    expect(files[0].content).toContain("- [ ] Flag SQL injection");
    expect(files[0].content).toContain("- [ ] Check auth");
  });

  it("produces no files when no profiles", () => {
    const files = gen.generate(makeCtx([]));
    expect(files).toHaveLength(0);
  });
});
