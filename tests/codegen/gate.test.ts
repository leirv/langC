import { describe, it, expect } from "vitest";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";

function parseOk(source: string) {
  const { tokens } = new Lexer(source).tokenize();
  const { ast, errors } = new Parser(tokens).parse();
  expect(errors).toHaveLength(0);
  return ast;
}

describe("GATE keyword", () => {
  it("lexes GATE as a keyword", () => {
    const { tokens } = new Lexer("GATE").tokenize();
    expect(tokens[0].type).toBe("GATE");
  });

  it("parses GATE property in PROJECT", () => {
    const ast = parseOk(`
      PROJECT "test" {
        GATE = manual
      }
    `);
    const project = ast.declarations[0];
    expect(project.kind).toBe("ProjectDecl");
    if (project.kind === "ProjectDecl") {
      const gateProp = project.properties.find(p => p.kind === "GateProperty");
      expect(gateProp).toBeDefined();
      if (gateProp?.kind === "GateProperty") {
        expect(gateProp.value).toBe("manual");
      }
    }
  });

  it("parses all gate modes", () => {
    for (const mode of ["manual", "auto"]) {
      const ast = parseOk(`PROJECT "test" { GATE = ${mode} }`);
      const project = ast.declarations[0];
      if (project.kind === "ProjectDecl") {
        const gateProp = project.properties.find(p => p.kind === "GateProperty");
        expect(gateProp).toBeDefined();
      }
    }
  });

  it("works alongside other properties", () => {
    const ast = parseOk(`
      PROJECT "test" {
        SCOPE = full,
        GATE = auto,
        REFERENCE = none
      }
    `);
    const project = ast.declarations[0];
    if (project.kind === "ProjectDecl") {
      expect(project.properties).toHaveLength(3);
      expect(project.properties.map(p => p.kind)).toContain("GateProperty");
    }
  });
});
