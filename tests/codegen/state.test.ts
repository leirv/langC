import { describe, it, expect } from "vitest";
import { StateGenerator } from "../../src/codegen/generators/state.js";
import type { CompilationContext } from "../../src/codegen/types.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(blocks: CreateBlock[] = []): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    profiles: [{ name: "Architect", role: "Architect", rules: [], patterns: [], onReview: [] }],
    profileExcepts: new Map(),
    createBlocks: blocks,
    updateBlocks: [],
    dependencyGraph: { nodes: new Map(), order: [], phases: [] },
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("StateGenerator", () => {
  const gen = new StateGenerator();

  it("generates state.json and MEMORY.md", () => {
    const files = gen.generate(makeCtx());
    expect(files).toHaveLength(2);
    const paths = files.map(f => f.path);
    expect(paths).toContain(".langc/state.json");
    expect(paths).toContain(".claude/agent-memory/langc/MEMORY.md");
  });

  it("state.json is valid JSON with components", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "DB", name: "users-db",
        properties: [{ kind: "LngProperty", value: "postgresql", loc }],
        members: [], loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    const stateFile = files.find(f => f.path === ".langc/state.json")!;
    const parsed = JSON.parse(stateFile.content);

    expect(parsed.project).toBe("test-app");
    expect(parsed.version).toBe(1);
    expect(parsed.components["DB.users-db"]).toBeDefined();
    expect(parsed.components["DB.users-db"].status).toBe("pending");
  });

  it("MEMORY.md lists all components", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "API", name: "users",
        properties: [
          { kind: "LngProperty", value: "python", loc },
          { kind: "FrameworkProperty", value: "fastapi", loc },
        ],
        members: [
          { kind: "MethodDecl", isPublic: false, httpMethod: "GET", path: "/users", description: "list", loc },
        ],
        loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    const memory = files.find(f => f.path.endsWith("MEMORY.md"))!;

    expect(memory.content).toContain("# LangC Build Memory");
    expect(memory.content).toContain("API.users");
    expect(memory.content).toContain("python/fastapi");
  });

  it("state.json includes profiles used", () => {
    const files = gen.generate(makeCtx());
    const parsed = JSON.parse(files.find(f => f.path === ".langc/state.json")!.content);
    expect(parsed.profiles_used).toEqual({ Architect: "v1" });
  });
});
