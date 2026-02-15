import { describe, it, expect } from "vitest";
import { ClaudeMdGenerator } from "../../src/codegen/generators/claude-md.js";
import type { CompilationContext } from "../../src/codegen/types.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(overrides: Partial<CompilationContext> = {}): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    profiles: [],
    profileExcepts: new Map(),
    createBlocks: [],
    updateBlocks: [],
    dependencyGraph: { nodes: new Map(), order: [], phases: [] },
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
    ...overrides,
  };
}

describe("ClaudeMdGenerator", () => {
  const gen = new ClaudeMdGenerator();

  it("generates CLAUDE.md with project name", () => {
    const files = gen.generate(makeCtx());
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("CLAUDE.md");
    expect(files[0].content).toContain("# Project: test-app");
  });

  it("includes scope description", () => {
    const files = gen.generate(makeCtx({ scope: "skeleton" }));
    expect(files[0].content).toContain("Skeleton build");
  });

  it("includes reference when not none", () => {
    const files = gen.generate(makeCtx({ reference: "./existing-app" }));
    expect(files[0].content).toContain("./existing-app");
    expect(files[0].content).toContain("Reference Codebase");
  });

  it("excludes reference section when none", () => {
    const files = gen.generate(makeCtx({ reference: "none" }));
    expect(files[0].content).not.toContain("Reference Codebase");
  });

  it("includes profile rules", () => {
    const ctx = makeCtx({
      profiles: [{
        name: "Architect",
        role: "Senior Architect",
        rules: ["Separate concerns", "Use DI"],
        patterns: [],
        onReview: [],
      }],
    });
    const files = gen.generate(ctx);
    expect(files[0].content).toContain("### Architect Rules");
    expect(files[0].content).toContain("- Separate concerns");
    expect(files[0].content).toContain("- Use DI");
  });

  it("includes dependency order and build instructions", () => {
    const createBlocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "DB", name: "users-db",
        properties: [], members: [], loc,
      },
      {
        kind: "CreateBlock", componentType: "API", name: "users",
        properties: [{
          kind: "DependsProperty",
          refs: [{ kind: "QualifiedRef", parts: ["DB", "users-db"], loc }],
          loc,
        }],
        members: [], loc,
      },
    ];

    const ctx = makeCtx({
      createBlocks,
      dependencyGraph: {
        nodes: new Map([
          ["DB.users-db", { id: "DB.users-db", componentType: "DB", name: "users-db", dependsOn: [] }],
          ["API.users", { id: "API.users", componentType: "API", name: "users", dependsOn: ["DB.users-db"] }],
        ]),
        order: ["DB.users-db", "API.users"],
        phases: [["DB.users-db"], ["API.users"]],
      },
    });

    const files = gen.generate(ctx);
    expect(files[0].content).toContain("1. DB.users-db (no dependencies)");
    expect(files[0].content).toContain("2. API.users (depends on: DB.users-db)");
    expect(files[0].content).toContain("`/build-db-users-db`");
    expect(files[0].content).toContain("`/build-api-users`");
  });
});
