import { describe, it, expect } from "vitest";
import { OrchestrateGenerator } from "../../src/codegen/generators/orchestrate.js";
import type { CompilationContext, DependencyGraph } from "../../src/codegen/types.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(
  blocks: CreateBlock[],
  graph: DependencyGraph,
): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    gate: "phase-by-phase",
    profiles: [{ name: "Architect", version: null, role: "Architect", rules: [], patterns: [], onReview: [] }],
    profileExcepts: new Map(),
    blockProfiles: new Map(),
    projectCtx: null,
    blockCtx: new Map(),
    createBlocks: blocks,
    updateBlocks: [],
    dependencyGraph: graph,
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("OrchestrateGenerator", () => {
  const gen = new OrchestrateGenerator();

  it("generates orchestrate SKILL.md", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "users-db", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.users-db", { id: "DB.users-db", componentType: "DB", name: "users-db", dependsOn: [] }]]),
      order: ["DB.users-db"],
      phases: [["DB.users-db"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".claude/commands/orchestrate.md");
  });

  it("has no YAML frontmatter", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files[0].content).not.toMatch(/^---\n/);
    expect(files[0].content).toMatch(/^# Orchestration Plan:/);
  });

  it("has Done section instead of Delegate/State", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files[0].content).toContain("## Done");
    expect(files[0].content).not.toContain("Delegate to");
    expect(files[0].content).not.toContain("## State Update");
  });

  it("shows correct build order across phases", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "users-db", properties: [], members: [], loc },
      { kind: "CreateBlock", componentType: "API", name: "users", properties: [], members: [], loc },
      { kind: "CreateBlock", componentType: "WEBUI", name: "users-display", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([
        ["DB.users-db", { id: "DB.users-db", componentType: "DB", name: "users-db", dependsOn: [] }],
        ["API.users", { id: "API.users", componentType: "API", name: "users", dependsOn: ["DB.users-db"] }],
        ["WEBUI.users-display", { id: "WEBUI.users-display", componentType: "WEBUI", name: "users-display", dependsOn: ["API.users"] }],
      ]),
      order: ["DB.users-db", "API.users", "WEBUI.users-display"],
      phases: [["DB.users-db"], ["API.users"], ["WEBUI.users-display"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files[0].content).toContain("### Phase 1");
    expect(files[0].content).toContain("`/build-db-users-db`");
    expect(files[0].content).toContain("### Phase 2");
    expect(files[0].content).toContain("`/build-api-users`");
    expect(files[0].content).toContain("### Phase 3");
    expect(files[0].content).toContain("`/build-webui-users-display`");
  });

  it("marks parallel phases", () => {
    const graph: DependencyGraph = {
      nodes: new Map([
        ["DB.a", { id: "DB.a", componentType: "DB", name: "a", dependsOn: [] }],
        ["DB.b", { id: "DB.b", componentType: "DB", name: "b", dependsOn: [] }],
      ]),
      order: ["DB.a", "DB.b"],
      phases: [["DB.a", "DB.b"]],
    };
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "a", properties: [], members: [], loc },
      { kind: "CreateBlock", componentType: "DB", name: "b", properties: [], members: [], loc },
    ];

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files[0].content).toContain("Phase 1 (Parallel)");
  });

  it("produces no files when no create blocks", () => {
    const ctx = makeCtx([], { nodes: new Map(), order: [], phases: [] });
    const files = gen.generate(ctx);
    expect(files).toHaveLength(0);
  });

  it("includes project CTX as Context section", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const ctx = makeCtx(blocks, graph);
    ctx.projectCtx = "Multi-tenant SaaS platform.";
    const files = gen.generate(ctx);
    expect(files[0].content).toContain("## Context");
    expect(files[0].content).toContain("Multi-tenant SaaS platform.");
  });

  it("includes Phase 0 architecture review when profiles have roles", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files[0].content).toContain("## Phase 0: Architecture Review");
    expect(files[0].content).toContain("@architect");
  });

  it("Phase 0 appears before Execution Steps", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    const content = files[0].content;
    const phase0Idx = content.indexOf("## Phase 0");
    const execIdx = content.indexOf("## Execution Steps");
    expect(phase0Idx).toBeGreaterThan(-1);
    expect(execIdx).toBeGreaterThan(phase0Idx);
  });

  it("build phases include consultation hint", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const files = gen.generate(makeCtx(blocks, graph));
    expect(files[0].content).toContain("For architectural doubts, consult @architect");
  });

  it("skips Phase 0 when no profiles qualify", () => {
    const blocks: CreateBlock[] = [
      { kind: "CreateBlock", componentType: "DB", name: "data", properties: [], members: [], loc },
    ];
    const graph: DependencyGraph = {
      nodes: new Map([["DB.data", { id: "DB.data", componentType: "DB", name: "data", dependsOn: [] }]]),
      order: ["DB.data"],
      phases: [["DB.data"]],
    };

    const ctx = makeCtx(blocks, graph);
    ctx.profiles = [{ name: "Empty", version: null, role: null, rules: [], patterns: [], onReview: [] }];
    const files = gen.generate(ctx);
    expect(files[0].content).not.toContain("Phase 0");
  });
});
