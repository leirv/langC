import { describe, it, expect } from "vitest";
import { CreateSkillGenerator } from "../../src/codegen/generators/create-skill.js";
import type { CompilationContext } from "../../src/codegen/types.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(blocks: CreateBlock[]): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    profiles: [],
    profileExcepts: new Map(),
    createBlocks: blocks,
    updateBlocks: [],
    dependencyGraph: { nodes: new Map(), order: [], phases: [] },
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("CreateSkillGenerator", () => {
  const gen = new CreateSkillGenerator();

  it("generates one SKILL.md per CREATE block", () => {
    const blocks: CreateBlock[] = [
      {
        kind: "CreateBlock", componentType: "DB", name: "users-db",
        properties: [{ kind: "LngProperty", value: "postgresql", loc }],
        members: [], loc,
      },
      {
        kind: "CreateBlock", componentType: "API", name: "users",
        properties: [
          { kind: "LngProperty", value: "python", loc },
          { kind: "FrameworkProperty", value: "fastapi", loc },
        ],
        members: [], loc,
      },
    ];

    const files = gen.generate(makeCtx(blocks));
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe(".claude/skills/build-db-users-db/SKILL.md");
    expect(files[1].path).toBe(".claude/skills/build-api-users/SKILL.md");
  });

  it("includes YAML frontmatter", () => {
    const blocks: CreateBlock[] = [{
      kind: "CreateBlock", componentType: "API", name: "users",
      properties: [{ kind: "LngProperty", value: "python", loc }],
      members: [], loc,
    }];

    const files = gen.generate(makeCtx(blocks));
    expect(files[0].content).toMatch(/^---\n/);
    expect(files[0].content).toContain("name: build-api-users");
    expect(files[0].content).toContain("user-invocable: true");
  });

  it("renders endpoint table for API methods", () => {
    const blocks: CreateBlock[] = [{
      kind: "CreateBlock", componentType: "API", name: "users",
      properties: [],
      members: [
        { kind: "MethodDecl", isPublic: false, httpMethod: "GET", path: "/users", description: "list users", loc },
        { kind: "MethodDecl", isPublic: true, httpMethod: "POST", path: "/users", description: "create user", loc },
      ],
      loc,
    }];

    const files = gen.generate(makeCtx(blocks));
    expect(files[0].content).toContain("| GET | /users | Required | list users |");
    expect(files[0].content).toContain("| POST | /users | PUBLIC | create user |");
  });

  it("renders table schema for DB blocks", () => {
    const blocks: CreateBlock[] = [{
      kind: "CreateBlock", componentType: "DB", name: "users-db",
      properties: [],
      members: [{
        kind: "TableDecl", name: "users",
        columns: [
          { kind: "ColumnDecl", name: "id", dataType: "int", description: "primary key", loc },
          { kind: "ColumnDecl", name: "name", dataType: "string", description: null, loc },
        ],
        loc,
      }],
      loc,
    }];

    const files = gen.generate(makeCtx(blocks));
    expect(files[0].content).toContain("## Table: users");
    expect(files[0].content).toContain("| id | int | primary key |");
    expect(files[0].content).toContain("| name | string | - |");
  });

  it("includes dependencies in spec", () => {
    const blocks: CreateBlock[] = [{
      kind: "CreateBlock", componentType: "API", name: "users",
      properties: [{
        kind: "DependsProperty",
        refs: [{ kind: "QualifiedRef", parts: ["DB", "users-db"], loc }],
        loc,
      }],
      members: [], loc,
    }];

    const files = gen.generate(makeCtx(blocks));
    expect(files[0].content).toContain("DB.users-db");
    expect(files[0].content).toContain("must be built first");
  });
});
