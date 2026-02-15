import { describe, it, expect } from "vitest";
import { RulesGenerator } from "../../src/codegen/generators/rules.js";
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

describe("RulesGenerator", () => {
  const gen = new RulesGenerator();

  it("generates rules files per component type", () => {
    const profiles: ResolvedProfile[] = [{
      name: "Architect", role: null, rules: [],
      patterns: [
        { componentType: "API", pattern: "router/ services/" },
        { componentType: "WEBUI", pattern: "pages/ components/" },
      ],
      onReview: [],
    }];

    const files = gen.generate(makeCtx(profiles));
    expect(files).toHaveLength(2);
    const paths = files.map(f => f.path);
    expect(paths).toContain(".claude/rules/api.md");
    expect(paths).toContain(".claude/rules/webui.md");
  });

  it("merges patterns from multiple profiles", () => {
    const profiles: ResolvedProfile[] = [
      {
        name: "Architect", role: null, rules: [],
        patterns: [{ componentType: "API", pattern: "router/ services/" }],
        onReview: [],
      },
      {
        name: "Security", role: null, rules: [],
        patterns: [{ componentType: "API", pattern: "middleware/auth.*" }],
        onReview: [],
      },
    ];

    const files = gen.generate(makeCtx(profiles));
    expect(files).toHaveLength(1);
    expect(files[0].content).toContain("`router/`");
    expect(files[0].content).toContain("`middleware/auth.*`");
    expect(files[0].content).toContain("Architect, Security");
  });

  it("produces no files when no patterns", () => {
    const profiles: ResolvedProfile[] = [{
      name: "Architect", role: null, rules: ["rule1"], patterns: [], onReview: [],
    }];

    const files = gen.generate(makeCtx(profiles));
    expect(files).toHaveLength(0);
  });

  it("uses uppercase label in content", () => {
    const profiles: ResolvedProfile[] = [{
      name: "Test", role: null, rules: [],
      patterns: [{ componentType: "DB", pattern: "migrations/ seeds/" }],
      onReview: [],
    }];

    const files = gen.generate(makeCtx(profiles));
    expect(files[0].content).toContain("# DB Component Rules");
  });
});
