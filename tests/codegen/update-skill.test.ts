import { describe, it, expect } from "vitest";
import { UpdateSkillGenerator } from "../../src/codegen/generators/update-skill.js";
import type { CompilationContext } from "../../src/codegen/types.js";
import type { UpdateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeCtx(updates: UpdateBlock[]): CompilationContext {
  return {
    projectName: "test-app",
    scope: "full",
    reference: "none",
    gate: "phase-by-phase",
    profiles: [],
    profileExcepts: new Map(),
    blockProfiles: new Map(),
    projectCtx: null,
    blockCtx: new Map(),
    createBlocks: [],
    updateBlocks: updates,
    dependencyGraph: { nodes: new Map(), order: [], phases: [] },
    ast: { kind: "Program", imports: [], declarations: [], loc },
    project: { kind: "ProjectDecl", name: "test-app", properties: [], blocks: [], loc },
  };
}

describe("UpdateSkillGenerator", () => {
  const gen = new UpdateSkillGenerator();

  it("generates SKILL.md for UPDATE blocks", () => {
    const updates: UpdateBlock[] = [{
      kind: "UpdateBlock",
      target: { kind: "QualifiedRef", parts: ["API", "users"], loc },
      members: [{
        kind: "AddMethodDecl",
        method: {
          kind: "MethodDecl", isPublic: false, httpMethod: "DELETE",
          path: "/users/{id}", description: "soft delete user", loc,
        },
        loc,
      }],
      loc,
    }];

    const files = gen.generate(makeCtx(updates));
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(".claude/commands/update-api-users.md");
    expect(files[0].content).toContain("API.users");
    expect(files[0].content).toContain("DELETE /users/{id}");
    expect(files[0].content).toContain("soft delete user");
  });

  it("handles REMOVE members", () => {
    const updates: UpdateBlock[] = [{
      kind: "UpdateBlock",
      target: { kind: "QualifiedRef", parts: ["API", "users"], loc },
      members: [{
        kind: "RemoveMethodDecl",
        httpMethod: "DELETE",
        path: "/users/{id}",
        loc,
      }],
      loc,
    }];

    const files = gen.generate(makeCtx(updates));
    expect(files[0].content).toContain("## Removals");
    expect(files[0].content).toContain("DELETE /users/{id}");
  });

  it("produces no files when no UPDATE blocks", () => {
    const files = gen.generate(makeCtx([]));
    expect(files).toHaveLength(0);
  });
});
