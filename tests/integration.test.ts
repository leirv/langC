import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import type { ProjectDecl, ProfileDecl, CreateBlock } from "../src/ast/nodes.js";

function parseFile(relativePath: string) {
  const abs = resolve(relativePath);
  const source = readFileSync(abs, "utf-8");
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { ast, errors: parseErrors } = new Parser(tokens).parse();
  return { ast, lexErrors, parseErrors };
}

describe("Integration: full file parsing", () => {
  it("parses examples/test-app.langc with 0 errors", () => {
    const { ast, lexErrors, parseErrors } = parseFile("examples/test-app.langc");
    expect(lexErrors).toHaveLength(0);
    expect(parseErrors).toHaveLength(0);

    // Imports
    expect(ast.imports).toHaveLength(2);
    expect(ast.imports[0].name).toBe("Architect");
    expect(ast.imports[1].name).toBe("Security");

    // Project
    expect(ast.declarations).toHaveLength(1);
    const proj = ast.declarations[0] as ProjectDecl;
    expect(proj.kind).toBe("ProjectDecl");
    expect(proj.name).toBe("test-app");

    // Properties
    expect(proj.properties).toHaveLength(3);

    // Blocks: 3 CREATE blocks
    expect(proj.blocks).toHaveLength(3);

    // DB block
    const db = proj.blocks[0] as CreateBlock;
    expect(db.componentType).toBe("DB");
    expect(db.name).toBe("users-db");
    expect(db.members).toHaveLength(1); // 1 TABLE
    if (db.members[0].kind === "TableDecl") {
      expect(db.members[0].columns).toHaveLength(4);
    }

    // API block
    const api = proj.blocks[1] as CreateBlock;
    expect(api.componentType).toBe("API");
    expect(api.name).toBe("users");
    expect(api.members).toHaveLength(5); // 5 METHODs

    // WEBUI block
    const webui = proj.blocks[2] as CreateBlock;
    expect(webui.componentType).toBe("WEBUI");
    expect(webui.name).toBe("users-display");
    expect(webui.members).toHaveLength(5); // 5 DISPLAYs
  });

  it("parses examples/profiles/architect.langc with 0 errors", () => {
    const { ast, lexErrors, parseErrors } = parseFile("examples/profiles/architect.langc");
    expect(lexErrors).toHaveLength(0);
    expect(parseErrors).toHaveLength(0);

    const prof = ast.declarations[0] as ProfileDecl;
    expect(prof.kind).toBe("ProfileDecl");
    expect(prof.name).toBe("Architect");
    expect(prof.role).toBe("Senior Software Architect");
    expect(prof.rules).toHaveLength(7);
    expect(prof.patterns).toHaveLength(3);
    expect(prof.onReview).toHaveLength(3);
  });

  it("parses examples/profiles/security.langc with 0 errors", () => {
    const { ast, lexErrors, parseErrors } = parseFile("examples/profiles/security.langc");
    expect(lexErrors).toHaveLength(0);
    expect(parseErrors).toHaveLength(0);

    const prof = ast.declarations[0] as ProfileDecl;
    expect(prof.kind).toBe("ProfileDecl");
    expect(prof.name).toBe("Security");
    expect(prof.rules).toHaveLength(8);
    expect(prof.patterns).toHaveLength(2);
    expect(prof.onReview).toHaveLength(4);
  });

  it("reports errors on malformed input", () => {
    const source = `PROJECT "bad" {
  CREATE API {
    METHOD "missing-http-method" -> "desc"
  }
}`;
    const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
    const { errors: parseErrors } = new Parser(tokens).parse();
    const totalErrors = lexErrors.length + parseErrors.length;
    expect(totalErrors).toBeGreaterThan(0);
  });

  it("handles update operations", () => {
    const source = `PROJECT "test-app" {
  SCOPE = update,
  REFERENCE = "./test-app",

  UPDATE API.users {
    ADD METHOD DELETE "/users/{id}" -> "soft delete",
    ADD METHOD GET "/users/search?q={query}" -> "search users"
  },

  UPDATE WEBUI.users-display {
    ADD DISPLAY API.users.DELETE("/users/{id}") -> "Delete button",
    ADD DISPLAY API.users.GET("/users/search") -> "Live search"
  }
}`;
    const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
    expect(lexErrors).toHaveLength(0);
    const { ast, errors: parseErrors } = new Parser(tokens).parse();
    expect(parseErrors).toHaveLength(0);

    const proj = ast.declarations[0] as ProjectDecl;
    expect(proj.blocks).toHaveLength(2);
    expect(proj.blocks[0].kind).toBe("UpdateBlock");
    expect(proj.blocks[1].kind).toBe("UpdateBlock");
  });
});
