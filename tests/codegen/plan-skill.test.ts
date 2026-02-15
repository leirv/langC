import { describe, it, expect } from "vitest";
import { PlanSkillGenerator } from "../../src/codegen/generators/plan-skill.js";
import type { CompilationContext, DependencyGraph } from "../../src/codegen/types.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(blocks: CreateBlock[], graph: DependencyGraph, gate = "phase-by-phase"): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    gate,
    profiles: [{ name: "Architect", version: null, role: "Architect", rules: [], patterns: [], onReview: ["Check layers"] }],
    profileExcepts: new Map(),
    blockProfiles: new Map(),
    createBlocks: blocks,
    updateBlocks: [],
    dependencyGraph: graph,
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("PlanSkillGenerator", () => {
  const gen = new PlanSkillGenerator();

  it("generates plan SKILL.md", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".claude/skills/plan/SKILL.md");
  });

  it("includes gate mode", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph, "manual"));
    expect(files[0].content).toContain("Current: **manual**");
  });

  it("includes profile ON_REVIEW checklist", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files[0].content).toContain("- [ ] Check layers");
  });

  it("returns empty for no create blocks", () => {
    const graph: DependencyGraph = { nodes: new Map(), order: [], phases: [] };
    const files = gen.generate(makeCtx([], graph));
    expect(files).toHaveLength(0);
  });
});
