import { describe, it, expect } from "vitest";
import { resolveImports } from "../../src/codegen/import-resolver.js";
import type { ImportDecl, ProfileRef } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

describe("profile versioning", () => {
  it("passes version from import to resolved profile", () => {
    const imports: ImportDecl[] = [
      { kind: "ImportDecl", name: "Security", from: null, version: "v2", loc },
    ];
    const refs: ProfileRef[] = [
      { kind: "ProfileRef", name: "Security", except: null, loc },
    ];

    const result = resolveImports(imports, [], refs, () => "", "/fake.langc");
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe("v2");
  });

  it("uses null version when not specified", () => {
    const imports: ImportDecl[] = [
      { kind: "ImportDecl", name: "Architect", from: null, version: null, loc },
    ];
    const refs: ProfileRef[] = [
      { kind: "ProfileRef", name: "Architect", except: null, loc },
    ];

    const result = resolveImports(imports, [], refs, () => "", "/fake.langc");
    expect(result).toHaveLength(1);
    expect(result[0].version).toBeNull();
  });
});
