import { describe, it, expect } from "vitest";
import { builtinProfiles } from "../../src/codegen/builtin-profiles.js";
import { resolveImports } from "../../src/codegen/import-resolver.js";
import type { ImportDecl, ProfileRef } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

describe("built-in profiles", () => {
  it("includes Architect, Security, QA, DevOps", () => {
    expect(builtinProfiles.has("Architect")).toBe(true);
    expect(builtinProfiles.has("Security")).toBe(true);
    expect(builtinProfiles.has("QA")).toBe(true);
    expect(builtinProfiles.has("DevOps")).toBe(true);
  });

  it("Architect has role, rules, patterns, onReview", () => {
    const arch = builtinProfiles.get("Architect")!;
    expect(arch.role).toBe("Senior Software Architect");
    expect(arch.rules.length).toBeGreaterThan(0);
    expect(arch.patterns.length).toBeGreaterThan(0);
    expect(arch.onReview.length).toBeGreaterThan(0);
  });

  it("resolves IMPORT Architect (no FROM) via built-in", () => {
    const imports: ImportDecl[] = [
      { kind: "ImportDecl", name: "Architect", from: null, version: null, loc },
    ];
    const refs: ProfileRef[] = [
      { kind: "ProfileRef", name: "Architect", except: null, loc },
    ];

    const result = resolveImports(imports, [], refs, () => "", "/fake.langc");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Architect");
    expect(result[0].role).toBe("Senior Software Architect");
    expect(result[0].rules.length).toBeGreaterThan(0);
  });

  it("resolves multiple built-in profiles", () => {
    const imports: ImportDecl[] = [
      { kind: "ImportDecl", name: "Security", from: null, version: null, loc },
      { kind: "ImportDecl", name: "QA", from: null, version: null, loc },
    ];
    const refs: ProfileRef[] = [
      { kind: "ProfileRef", name: "Security", except: null, loc },
      { kind: "ProfileRef", name: "QA", except: null, loc },
    ];

    const result = resolveImports(imports, [], refs, () => "", "/fake.langc");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Security");
    expect(result[1].name).toBe("QA");
  });

  it("FROM file overrides built-in of same name", () => {
    const customSource = `
      PROFILE Architect {
        ROLE = "Custom Architect",
        RULES { "custom rule only" }
      }
    `;
    const imports: ImportDecl[] = [
      { kind: "ImportDecl", name: "Architect", from: "./custom.langc", version: null, loc },
    ];
    const refs: ProfileRef[] = [
      { kind: "ProfileRef", name: "Architect", except: null, loc },
    ];

    const result = resolveImports(imports, [], refs, () => customSource, "/project/main.langc");
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("Custom Architect");
    expect(result[0].rules).toEqual(["custom rule only"]);
  });
});
