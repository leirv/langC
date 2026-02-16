import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import type { Program, CreateBlock, UpdateBlock, ProfileDecl, ProjectDecl } from "../src/ast/nodes.js";

function parse(source: string) {
  const { tokens } = new Lexer(source).tokenize();
  return new Parser(tokens).parse();
}

function parseOk(source: string): Program {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);
  return ast;
}

describe("Parser", () => {
  describe("imports", () => {
    it("parses simple import", () => {
      const ast = parseOk('IMPORT Architect\nPROJECT "x" {}');
      expect(ast.imports).toHaveLength(1);
      expect(ast.imports[0].name).toBe("Architect");
      expect(ast.imports[0].from).toBeNull();
    });

    it("parses import with FROM", () => {
      const ast = parseOk('IMPORT Security FROM "./security.langc"\nPROJECT "x" {}');
      expect(ast.imports[0].name).toBe("Security");
      expect(ast.imports[0].from).toBe("./security.langc");
    });

    it("parses import with version", () => {
      const ast = parseOk('IMPORT Security@v2 FROM "./sec.langc"\nPROJECT "x" {}');
      expect(ast.imports[0].version).toBe("v2");
    });
  });

  describe("project declaration", () => {
    it("parses empty project", () => {
      const ast = parseOk('PROJECT "test-app" {}');
      const proj = ast.declarations[0] as ProjectDecl;
      expect(proj.kind).toBe("ProjectDecl");
      expect(proj.name).toBe("test-app");
    });

    it("parses project properties", () => {
      const ast = parseOk(`PROJECT "app" {
        SCOPE = full,
        REFERENCE = none,
        PROFILES = [Architect, Security]
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      expect(proj.properties).toHaveLength(3);
      expect(proj.properties[0]).toMatchObject({ kind: "ScopeProperty", value: "full" });
      expect(proj.properties[1]).toMatchObject({ kind: "ReferenceProperty", value: "none" });
      expect(proj.properties[2].kind).toBe("ProfilesProperty");
    });

    it("parses REFERENCE with string path", () => {
      const ast = parseOk('PROJECT "app" { REFERENCE = "./my-app" }');
      const proj = ast.declarations[0] as ProjectDecl;
      expect(proj.properties[0]).toMatchObject({ kind: "ReferenceProperty", value: "./my-app" });
    });

    it("parses profiles with EXCEPT", () => {
      const ast = parseOk('PROJECT "app" { PROFILES = [Security(EXCEPT = "auth")] }');
      const proj = ast.declarations[0] as ProjectDecl;
      const prop = proj.properties[0];
      expect(prop.kind).toBe("ProfilesProperty");
      if (prop.kind === "ProfilesProperty") {
        expect(prop.names[0].except).toBe("auth");
      }
    });
  });

  describe("CTX property", () => {
    it("parses project-level CTX", () => {
      const ast = parseOk('PROJECT "app" { CTX = "Multi-tenant SaaS platform." }');
      const proj = ast.declarations[0] as ProjectDecl;
      expect(proj.properties).toHaveLength(1);
      expect(proj.properties[0]).toMatchObject({ kind: "CtxProperty", value: "Multi-tenant SaaS platform." });
    });

    it("parses block-level CTX", () => {
      const ast = parseOk(`PROJECT "app" {
        CREATE API "users" {
          CTX = "Core identity service.",
          LNG = python
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as CreateBlock;
      expect(block.properties[0]).toMatchObject({ kind: "CtxProperty", value: "Core identity service." });
    });

    it("parses CTX at both project and block level", () => {
      const ast = parseOk(`PROJECT "app" {
        CTX = "SaaS platform.",
        CREATE API "users" {
          CTX = "Identity service.",
          LNG = python
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      expect(proj.properties[0]).toMatchObject({ kind: "CtxProperty", value: "SaaS platform." });
      const block = proj.blocks[0] as CreateBlock;
      expect(block.properties[0]).toMatchObject({ kind: "CtxProperty", value: "Identity service." });
    });
  });

  describe("CREATE blocks", () => {
    it("parses CREATE DB with TABLE", () => {
      const ast = parseOk(`PROJECT "app" {
        CREATE DB "users-db" {
          LNG = postgresql,
          DEPENDS = none,
          TABLE "users" {
            id: int -> "primary key",
            name: string -> "required"
          }
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as CreateBlock;
      expect(block.kind).toBe("CreateBlock");
      expect(block.componentType).toBe("DB");
      expect(block.name).toBe("users-db");
      expect(block.members).toHaveLength(1);
      expect(block.members[0].kind).toBe("TableDecl");
      if (block.members[0].kind === "TableDecl") {
        expect(block.members[0].columns).toHaveLength(2);
        expect(block.members[0].columns[0].name).toBe("id");
        expect(block.members[0].columns[0].dataType).toBe("int");
        expect(block.members[0].columns[0].description).toBe("primary key");
      }
    });

    it("parses CREATE API with METHODs", () => {
      const ast = parseOk(`PROJECT "app" {
        CREATE API "users" {
          LNG = python,
          FRAMEWORK = fastapi,
          DEPENDS = [DB.users-db],
          METHOD GET "/users" -> "list users",
          METHOD POST "/users" -> "create user"
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as CreateBlock;
      expect(block.componentType).toBe("API");
      expect(block.name).toBe("users");
      expect(block.properties).toHaveLength(3);
      expect(block.members).toHaveLength(2);
      expect(block.members[0].kind).toBe("MethodDecl");
      if (block.members[0].kind === "MethodDecl") {
        expect(block.members[0].httpMethod).toBe("GET");
        expect(block.members[0].path).toBe("/users");
      }
    });

    it("parses DEPENDS with qualified refs", () => {
      const ast = parseOk(`PROJECT "app" {
        CREATE API "users" {
          DEPENDS = [DB.users-db]
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as CreateBlock;
      const deps = block.properties.find(p => p.kind === "DependsProperty");
      expect(deps).toBeDefined();
      if (deps?.kind === "DependsProperty") {
        expect(deps.refs[0].parts).toEqual(["DB", "users-db"]);
      }
    });

    it("parses CREATE WEBUI with DISPLAY", () => {
      const ast = parseOk(`PROJECT "app" {
        CREATE WEBUI "dashboard" {
          DISPLAY API.users.GET("/users") -> "User table"
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as CreateBlock;
      expect(block.members[0].kind).toBe("DisplayDecl");
      if (block.members[0].kind === "DisplayDecl") {
        expect(block.members[0].target.parts).toEqual(["API", "users", "GET"]);
        expect(block.members[0].path).toBe("/users");
        expect(block.members[0].description).toBe("User table");
      }
    });

    it("parses PUBLIC method", () => {
      const ast = parseOk(`PROJECT "app" {
        CREATE API "health" {
          METHOD PUBLIC GET "/health" -> "healthcheck",
          PUBLIC METHOD POST "/test" -> "also public"
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as CreateBlock;
      expect(block.members).toHaveLength(2);
      if (block.members[0].kind === "MethodDecl") {
        expect(block.members[0].isPublic).toBe(true);
        expect(block.members[0].httpMethod).toBe("GET");
      }
      if (block.members[1].kind === "MethodDecl") {
        expect(block.members[1].isPublic).toBe(true);
        expect(block.members[1].httpMethod).toBe("POST");
      }
    });
  });

  describe("UPDATE blocks", () => {
    it("parses UPDATE with ADD METHOD", () => {
      const ast = parseOk(`PROJECT "app" {
        SCOPE = update,
        UPDATE API.users {
          ADD METHOD DELETE "/users/{id}" -> "soft delete"
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as UpdateBlock;
      expect(block.kind).toBe("UpdateBlock");
      expect(block.target.parts).toEqual(["API", "users"]);
      expect(block.members).toHaveLength(1);
      expect(block.members[0].kind).toBe("AddMethodDecl");
    });

    it("parses UPDATE with ADD DISPLAY", () => {
      const ast = parseOk(`PROJECT "app" {
        UPDATE WEBUI.dashboard {
          ADD DISPLAY API.users.GET("/users") -> "user list"
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as UpdateBlock;
      expect(block.members[0].kind).toBe("AddDisplayDecl");
    });
  });

  describe("PROFILE declarations", () => {
    it("parses full profile", () => {
      const ast = parseOk(`PROFILE Architect {
        ROLE = "Senior Architect",
        RULES {
          "Rule one",
          "Rule two"
        },
        PATTERNS {
          API -> "router/ services/",
          WEBUI -> "pages/ components/"
        },
        ON_REVIEW {
          "Check this",
          "Check that"
        }
      }`);
      const prof = ast.declarations[0] as ProfileDecl;
      expect(prof.kind).toBe("ProfileDecl");
      expect(prof.name).toBe("Architect");
      expect(prof.role).toBe("Senior Architect");
      expect(prof.rules).toHaveLength(2);
      expect(prof.patterns).toHaveLength(2);
      expect(prof.onReview).toHaveLength(2);
    });

    it("parses profile with EXTENDS", () => {
      const ast = parseOk(`PROFILE FullStack {
        EXTENDS = [Architect, Security, QA]
      }`);
      const prof = ast.declarations[0] as ProfileDecl;
      expect(prof.extends_).toEqual(["Architect", "Security", "QA"]);
    });
  });

  describe("qualified references", () => {
    it("parses simple ref", () => {
      const ast = parseOk(`PROJECT "app" {
        UPDATE API.users {
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as UpdateBlock;
      expect(block.target.parts).toEqual(["API", "users"]);
    });

    it("parses deep ref", () => {
      const ast = parseOk(`PROJECT "app" {
        CREATE WEBUI "ui" {
          DISPLAY API.users.GET("/path") -> "desc"
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      const block = proj.blocks[0] as CreateBlock;
      if (block.members[0].kind === "DisplayDecl") {
        expect(block.members[0].target.parts).toEqual(["API", "users", "GET"]);
      }
    });
  });

  describe("error recovery", () => {
    it("collects errors without crashing", () => {
      const { errors } = parse('PROJECT "app" { BADTOKEN }');
      expect(errors.length).toBeGreaterThan(0);
    });

    it("reports line and column in errors", () => {
      const { errors } = parse('PROJECT "app" {\n  BADTOKEN\n}');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].line).toBeGreaterThanOrEqual(1);
      expect(errors[0].column).toBeGreaterThanOrEqual(1);
    });
  });

  describe("optional commas", () => {
    it("parses without commas", () => {
      const ast = parseOk(`PROJECT "app" {
        SCOPE = full
        REFERENCE = none
        CREATE API "users" {
          METHOD GET "/users" -> "list"
          METHOD POST "/users" -> "create"
        }
      }`);
      const proj = ast.declarations[0] as ProjectDecl;
      expect(proj.properties).toHaveLength(2);
      const block = proj.blocks[0] as CreateBlock;
      expect(block.members).toHaveLength(2);
    });
  });
});
