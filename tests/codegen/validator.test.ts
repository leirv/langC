import { describe, it, expect } from "vitest";
import { semanticValidate } from "../../src/codegen/validator.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import type { Program } from "../../src/ast/nodes.js";

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
    expect(result.checks.filter(c => c.passed)).toHaveLength(result.checks.length);
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
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("DB.missing");
    expect(result.errors[0].message).toContain("does not resolve");
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
    const cycleCheck = result.checks.find(c => c.name === "No circular dependencies");
    expect(cycleCheck?.passed).toBe(false);
  });

  it("detects missing import file", () => {
    const ast = parse(`
      IMPORT Custom FROM "./profiles/custom.langc"
      PROJECT "app" {
        PROFILES = [Custom],
        CREATE DB "data" {
          LNG = postgresql
        }
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
        CREATE DB "data" {
          LNG = postgresql
        }
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
        CREATE DB "data" {
          LNG = postgresql
        }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(true);
    const importCheck = result.checks.find(c => c.name === "All IMPORT profiles found");
    expect(importCheck?.passed).toBe(true);
  });

  it("warns about missing LNG on non-DB blocks", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE API "svc" {
          FRAMEWORK = fastapi
        }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(true); // warnings don't fail
    expect(result.warnings.some(w => w.message.includes("no LNG"))).toBe(true);
  });

  it("warns about FRAMEWORK without LNG", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE WEBUI "ui" {
          FRAMEWORK = nextjs
        }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.warnings.some(w => w.message.includes("FRAMEWORK but no LNG"))).toBe(true);
  });

  it("DEPENDS = none is not flagged as unresolved", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE DB "data" {
          LNG = postgresql,
          DEPENDS = none
        }
      }
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(true);
    const depsCheck = result.checks.find(c => c.name === "All DEPENDS references resolve");
    expect(depsCheck?.passed).toBe(true);
  });

  it("returns all check results", () => {
    const ast = parse(`
      PROJECT "app" {
        CREATE DB "data" {
          LNG = postgresql
        }
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
    const ast = parse(`
      IMPORT Architect
    `);

    const result = semanticValidate(ast, alwaysExists, "/fake.langc");
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("No PROJECT declaration");
  });
});
