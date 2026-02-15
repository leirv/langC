import { describe, it, expect } from "vitest";
import { semanticValidate } from "../../src/codegen/validator.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import type { Program } from "../../src/ast/nodes.js";
import type { ResolvedProfile } from "../../src/codegen/types.js";
import type { ReferenceScan } from "../../src/codegen/reference-scanner.js";

function parse(source: string): Program {
  const { tokens } = new Lexer(source).tokenize();
  const { ast, errors } = new Parser(tokens).parse();
  expect(errors).toHaveLength(0);
  return ast;
}

const alwaysExists = () => true;
const neverExists = () => false;

describe("semantic validator", () => {
  it("passes a valid program", () => {
    const ast = parse(`
      IMPORT Architect
      PROJECT "app" {
        SCOPE = full,
        PROFILES = [Architect],
        CREATE DB "data" {
          LNG = postgresql
        },
        CREATE API "svc" {
          LNG = python,
          FRAMEWORK = fastapi,
          DEPENDS = [DB.data]
        }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects unresolved DEPENDS reference", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" {
          LNG = python,
          DEPENDS = [DB.missing]
        }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("DB.missing");
  });

  it("detects circular dependencies", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "a" {
          LNG = python,
          DEPENDS = [API.b]
        },
        CREATE API "b" {
          LNG = python,
          DEPENDS = [API.a]
        }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("Circular dependency"))).toBe(true);
  });

  it("detects missing import file", () => {
    const ast = parse(`
      IMPORT Custom FROM "./profiles/custom.langc"
      PROJECT "app" {
        PROFILES = [Custom],
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const result = semanticValidate(ast, neverExists, "/project/test.langc");
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("file not found");
  });

  it("detects unknown built-in profile", () => {
    const ast = parse(`
      IMPORT UnknownProfile
      PROJECT "app" {
        PROFILES = [UnknownProfile],
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("not a built-in profile");
  });

  it("accepts valid built-in profiles", () => {
    const ast = parse(`
      IMPORT Architect
      IMPORT Security
      PROJECT "app" {
        PROFILES = [Architect, Security],
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(true);
  });

  it("warns about missing LNG on non-DB blocks", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" { FRAMEWORK = fastapi }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.message.includes("no LNG"))).toBe(true);
  });

  it("DEPENDS = none is not flagged", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE DB "data" { LNG = postgresql, DEPENDS = none }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(true);
  });

  it("returns all check results", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    const checkNames = result.checks.map(c => c.name);
    expect(checkNames).toContain("Syntax valid");
    expect(checkNames).toContain("All DEPENDS references resolve");
    expect(checkNames).toContain("No circular dependencies");
    expect(checkNames).toContain("All IMPORT profiles found");
    expect(checkNames).toContain("No profile conflicts");
  });

  it("errors when no PROJECT declaration", () => {
    const ast = parse(`IMPORT Architect`);
    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("No PROJECT declaration");
  });
});

describe("deep profile conflict detection", () => {
  it("detects layered vs monolith conflict", () => {
    const ast = parse(`
      PROJECT "app" {
        PROFILES = [A, B],
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "A", version: null, role: null, rules: ["Split into layers for clean architecture"], patterns: [], onReview: [] },
      { name: "B", version: null, role: null, rules: ["Use single file MVC pattern"], patterns: [], onReview: [] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    expect(result.warnings.some(w => w.message.includes("layered vs single-file"))).toBe(true);
    const conflictCheck = result.checks.find(c => c.name === "No profile conflicts");
    expect(conflictCheck?.passed).toBe(false);
  });

  it("detects never/always contradictions", () => {
    const ast = parse(`
      PROJECT "app" {
        PROFILES = [A, B],
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "A", version: null, role: null, rules: ["Never use global state"], patterns: [], onReview: [] },
      { name: "B", version: null, role: null, rules: ["Always use global state for config"], patterns: [], onReview: [] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    expect(result.warnings.some(w => w.message.includes("Rule contradiction"))).toBe(true);
  });

  it("passes when no conflicts exist", () => {
    const ast = parse(`
      PROJECT "app" {
        PROFILES = [A, B],
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "A", version: null, role: null, rules: ["Use dependency injection"], patterns: [], onReview: [] },
      { name: "B", version: null, role: null, rules: ["Validate all inputs"], patterns: [], onReview: [] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    const conflictCheck = result.checks.find(c => c.name === "No profile conflicts");
    expect(conflictCheck?.passed).toBe(true);
  });

  it("detects microservice vs monolith conflict", () => {
    const ast = parse(`
      PROJECT "app" {
        PROFILES = [A, B],
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "A", version: null, role: null, rules: ["Deploy as microservice per domain"], patterns: [], onReview: [] },
      { name: "B", version: null, role: null, rules: ["Keep everything in a monolith"], patterns: [], onReview: [] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    expect(result.warnings.some(w => w.message.includes("microservices vs monolith"))).toBe(true);
  });
});

describe("smart ON_REVIEW evaluation", () => {
  const loc = { line: 1, column: 1 };

  it("flags API blocks with too many methods", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" {
          LNG = python,
          METHOD GET "/a" -> "a",
          METHOD GET "/b" -> "b",
          METHOD GET "/c" -> "c",
          METHOD GET "/d" -> "d"
        }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "QA", version: null, role: null, rules: [], patterns: [],
        onReview: ["Warn if a CREATE block has more than 3 methods — suggest splitting"] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    expect(result.warnings.some(w => w.message.includes("4 methods") && w.message.includes("limit: 3"))).toBe(true);
    const reviewCheck = result.checks.find(c => c.name === "ON_REVIEW evaluation");
    expect(reviewCheck?.passed).toBe(false);
  });

  it("flags POST endpoints without rate limiting", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" {
          LNG = python,
          METHOD POST "/users" -> "create user"
        }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [],
        onReview: ["Warn if no rate limiting is configured on POST endpoints"] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    expect(result.warnings.some(w => w.message.includes("rate limiting"))).toBe(true);
  });

  it("flags all-public APIs with no auth", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "public" {
          LNG = python,
          PUBLIC METHOD GET "/health" -> "healthcheck"
        }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "Security", version: null, role: null, rules: [], patterns: [],
        onReview: ["Flag any endpoint without auth middleware"] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    expect(result.warnings.some(w => w.message.includes("PUBLIC (no auth)"))).toBe(true);
  });

  it("passes when no ON_REVIEW issues found", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE DB "data" { LNG = postgresql }
      }
    `);

    const profiles: ResolvedProfile[] = [
      { name: "Architect", version: null, role: null, rules: [], patterns: [],
        onReview: ["Warn if a CREATE block has more than 10 methods"] },
    ];

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", profiles);
    const reviewCheck = result.checks.find(c => c.name === "ON_REVIEW evaluation");
    expect(reviewCheck?.passed).toBe(true);
  });
});

describe("REFERENCE override detection", () => {
  const refScan: ReferenceScan = {
    path: "/ref",
    scannedAt: "2026-01-01",
    fileTree: ["src/app.py", "src/main.py"],
    detectedStack: {
      languages: ["Python"],
      frameworks: ["Flask"],
      testing: ["pytest"],
      database: [],
      buildTools: [],
    },
    conventions: [],
  };

  it("warns when LNG doesn't match reference codebase", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" { LNG = go, FRAMEWORK = gin }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", undefined, refScan);
    expect(result.warnings.some(w => w.message.includes("REFERENCE override") && w.message.includes("LNG=go"))).toBe(true);
    const check = result.checks.find(c => c.name === "REFERENCE compatibility");
    expect(check?.passed).toBe(false);
  });

  it("warns when FRAMEWORK doesn't match reference codebase", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" { LNG = python, FRAMEWORK = fastapi }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", undefined, refScan);
    // LNG matches (python), but framework doesn't (fastapi vs Flask)
    expect(result.warnings.some(w => w.message.includes("REFERENCE override") && w.message.includes("FRAMEWORK=fastapi"))).toBe(true);
  });

  it("passes when LNG and FRAMEWORK match reference", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" { LNG = python, FRAMEWORK = flask }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc", undefined, refScan);
    const check = result.checks.find(c => c.name === "REFERENCE compatibility");
    expect(check?.passed).toBe(true);
  });

  it("skips check when no reference scan provided", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" { LNG = go }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    const check = result.checks.find(c => c.name === "REFERENCE compatibility");
    expect(check).toBeUndefined();
  });
});
