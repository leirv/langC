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
    gate: "phase-by-phase",
    profiles: [{ name: "Architect", version: null, role: "Architect", rules: [], patterns: [], onReview: [] }],
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

describe("StateGenerator", () => {
  const gen = new StateGenerator();

  it("generates state.json and MEMORY.md", () => {
    const files = gen.generate(makeCtx());
    expect(files).toHaveLength(2);
    const paths = files.map(f => f.path);
    expect(paths).toContain(".langc/state.json");
    expect(paths).toContain(".claude/agent-memory/langc/MEMORY.md");
  });

  it("state.json has checksum and path per component", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "DB", name: "users-db",
        properties: [{ kind: "LngProperty", value: "postgresql", loc }],
        members: [
          { kind: "TableDecl", name: "users", columns: [
            { kind: "ColumnDecl", name: "id", dataType: "int", description: null, loc },
          ], loc },
        ], loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    const parsed = JSON.parse(files.find(f => f.path === ".langc/state.json")!.content);
    const comp = parsed.components["DB.users-db"];

    expect(comp.checksum).toMatch(/^[a-f0-9]{12}$/);
    expect(comp.path).toBe("./test-app/db/users-db/");
    expect(comp.tables).toEqual(["users"]);
    expect(comp.lng).toBe("postgresql");
    expect(comp.dependsOn).toEqual([]);
  });

  it("state.json tracks methods on API blocks", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "API", name: "users",
        properties: [
          { kind: "LngProperty", value: "python", loc },
          { kind: "FrameworkProperty", value: "fastapi", loc },
        ],
        members: [
          { kind: "MethodDecl", isPublic: false, httpMethod: "GET", path: "/users", description: "list", loc },
          { kind: "MethodDecl", isPublic: false, httpMethod: "POST", path: "/users", description: "create", loc },
        ],
        loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    const parsed = JSON.parse(files.find(f => f.path === ".langc/state.json")!.content);
    const comp = parsed.components["API.users"];

    expect(comp.methods).toEqual(["GET /users", "POST /users"]);
    expect(comp.framework).toBe("fastapi");
    expect(comp.checksum).toMatch(/^[a-f0-9]{12}$/);
  });

  it("state.json tracks views on WEBUI blocks", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "WEBUI", name: "dashboard",
        properties: [{ kind: "LngProperty", value: "React", loc }],
        members: [
          { kind: "DisplayDecl", target: { kind: "QualifiedRef", parts: ["API", "users", "GET"], loc }, path: "/users", description: "User list", loc },
        ],
        loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    const parsed = JSON.parse(files.find(f => f.path === ".langc/state.json")!.content);
    const comp = parsed.components["WEBUI.dashboard"];

    expect(comp.views).toEqual(["User list"]);
  });

  it("state.json includes build_order and phases", () => {
    const ctx = makeCtx();
    ctx.dependencyGraph = {
      nodes: new Map(),
      order: ["DB.data", "API.svc"],
      phases: [["DB.data"], ["API.svc"]],
    };

    const files = gen.generate(ctx);
    const parsed = JSON.parse(files.find(f => f.path === ".langc/state.json")!.content);

    expect(parsed.build_order).toEqual(["DB.data", "API.svc"]);
    expect(parsed.phases).toEqual([["DB.data"], ["API.svc"]]);
    expect(parsed.gate).toBe("phase-by-phase");
  });

  it("checksum is deterministic for same input", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "DB", name: "data",
        properties: [{ kind: "LngProperty", value: "postgresql", loc }],
        members: [], loc,
      },
    ];

    const files1 = gen.generate(makeCtx(blocks));
    const files2 = gen.generate(makeCtx(blocks));
    const p1 = JSON.parse(files1.find(f => f.path === ".langc/state.json")!.content);
    const p2 = JSON.parse(files2.find(f => f.path === ".langc/state.json")!.content);

    expect(p1.components["DB.data"].checksum).toBe(p2.components["DB.data"].checksum);
  });

  it("state.json includes profiles used", () => {
    const files = gen.generate(makeCtx());
    const parsed = JSON.parse(files.find(f => f.path === ".langc/state.json")!.content);
    expect(parsed.profiles_used).toEqual({ Architect: "v1" });
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
});
