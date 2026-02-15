import { describe, it, expect } from "vitest";
import { LngRulesGenerator } from "../../src/codegen/generators/lng-rules.js";
import type { CompilationContext } from "../../src/codegen/types.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(blocks: CreateBlock[]): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    gate: "phase-by-phase",
    profiles: [],
    profileExcepts: new Map(),
    blockProfiles: new Map(),
    createBlocks: blocks,
    updateBlocks: [],
    dependencyGraph: { nodes: new Map(), order: [], phases: [] },
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("LngRulesGenerator", () => {
  const gen = new LngRulesGenerator();

  it("generates rules for python", () => {
    const blocks: CreateBlock[] = [{
      kind: "CreateBlock", componentType: "API", name: "users",
      properties: [{ kind: "LngProperty", value: "python", loc }],
      members: [], loc,
    }];

    const files = gen.generate(makeCtx(blocks));
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".claude/rules/python.md");
    expect(files[0].content).toContain("Python Language Conventions");
    expect(files[0].content).toContain("type hints");
  });

  it("generates rules for react", () => {
    const blocks: CreateBlock[] = [{
      kind: "CreateBlock", componentType: "WEBUI", name: "frontend",
      properties: [{ kind: "LngProperty", value: "React", loc }],
      members: [], loc,
    }];

    const files = gen.generate(makeCtx(blocks));
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".claude/rules/react.md");
    expect(files[0].content).toContain("React Language Conventions");
  });

  it("deduplicates same language across blocks", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "API", name: "a",
        properties: [{ kind: "LngProperty", value: "python", loc }],
        members: [], loc,
      },
      {
        kind: "CreateBlock", componentType: "API", name: "b",
        properties: [{ kind: "LngProperty", value: "python", loc }],
        members: [], loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    expect(files).toHaveLength(1);
    expect(files[0].content).toContain("API.a, API.b");
  });

  it("generates multiple language files", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "API", name: "api",
        properties: [{ kind: "LngProperty", value: "python", loc }],
        members: [], loc,
      },
      {
        kind: "CreateBlock", componentType: "WEBUI", name: "ui",
        properties: [{ kind: "LngProperty", value: "React", loc }],
        members: [], loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    expect(files).toHaveLength(2);
    const paths = files.map(f => f.path);
    expect(paths).toContain(".claude/rules/python.md");
    expect(paths).toContain(".claude/rules/react.md");
  });

  it("skips unknown languages", () => {
    const blocks: CreateBlock[] = [{
      kind: "CreateBlock", componentType: "API", name: "api",
      properties: [{ kind: "LngProperty", value: "brainfuck", loc }],
      members: [], loc,
    }];

    const files = gen.generate(makeCtx(blocks));
    expect(files).toHaveLength(0);
  });
});
