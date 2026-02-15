import { describe, it, expect } from "vitest";
import { buildDependencyGraph } from "../../src/codegen/dependency-graph.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeBlock(
  type: "DB" | "API" | "WEBUI" | "FNC",
  name: string,
  deps: string[][] = [],
): CreateBlock {
  return {
    kind: "CreateBlock",
    componentType: type,
    name,
    properties: deps.length > 0
      ? [{
          kind: "DependsProperty" as const,
          refs: deps.map(parts => ({ kind: "QualifiedRef" as const, parts, loc })),
          loc,
        }]
      : [],
    members: [],
    loc,
  };
}

describe("dependency-graph", () => {
  it("builds a graph with no dependencies", () => {
    const blocks = [makeBlock("DB", "users")];
    const graph = buildDependencyGraph(blocks);

    expect(graph.order).toEqual(["DB.users"]);
    expect(graph.phases).toEqual([["DB.users"]]);
  });

  it("sorts in dependency order", () => {
    const blocks = [
      makeBlock("WEBUI", "frontend", [["API", "backend"]]),
      makeBlock("API", "backend", [["DB", "data"]]),
      makeBlock("DB", "data"),
    ];
    const graph = buildDependencyGraph(blocks);

    expect(graph.order).toEqual(["DB.data", "API.backend", "WEBUI.frontend"]);
  });

  it("computes parallel phases", () => {
    const blocks = [
      makeBlock("DB", "users"),
      makeBlock("DB", "logs"),
      makeBlock("API", "users-api", [["DB", "users"]]),
      makeBlock("API", "logs-api", [["DB", "logs"]]),
      makeBlock("WEBUI", "dashboard", [["API", "users-api"], ["API", "logs-api"]]),
    ];

    const graph = buildDependencyGraph(blocks);

    expect(graph.phases[0]).toContain("DB.users");
    expect(graph.phases[0]).toContain("DB.logs");
    expect(graph.phases[1]).toContain("API.users-api");
    expect(graph.phases[1]).toContain("API.logs-api");
    expect(graph.phases[2]).toEqual(["WEBUI.dashboard"]);
  });

  it("detects cycles", () => {
    const blocks = [
      makeBlock("API", "a", [["API", "b"]]),
      makeBlock("API", "b", [["API", "a"]]),
    ];

    expect(() => buildDependencyGraph(blocks)).toThrow(/cycle/i);
  });

  it("handles empty input", () => {
    const graph = buildDependencyGraph([]);
    expect(graph.order).toEqual([]);
    expect(graph.phases).toEqual([]);
  });

  it("handles single chain", () => {
    const blocks = [
      makeBlock("DB", "users-db"),
      makeBlock("API", "users", [["DB", "users-db"]]),
      makeBlock("WEBUI", "users-display", [["API", "users"]]),
    ];

    const graph = buildDependencyGraph(blocks);
    expect(graph.order).toEqual(["DB.users-db", "API.users", "WEBUI.users-display"]);
    expect(graph.phases).toHaveLength(3);
  });
});
