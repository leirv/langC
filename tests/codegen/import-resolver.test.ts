import { describe, it, expect } from "vitest";
import { resolveImports, resolvePath, applyExcept } from "../../src/codegen/import-resolver.js";
import type { ImportDecl, ProfileDecl, ProfileRef } from "../../src/ast/nodes.js";
import type { ResolvedProfile } from "../../src/codegen/types.js";

const loc = { line: 1, column: 1 };

function makeProfile(overrides: Partial<ProfileDecl> = {}): ProfileDecl {
  return {
    kind: "ProfileDecl",
    name: "TestProfile",
    role: "Test Role",
    extends_: null,
    rules: ["rule1", "rule2"],
    patterns: [{ kind: "PatternEntry", componentType: "API", pattern: "router/ services/", loc }],
    onReview: ["check1"],
    loc,
    ...overrides,
  };
}

function makeImport(name: string, from: string | null = null): ImportDecl {
  return { kind: "ImportDecl", name, from, version: null, loc };
}

function makeRef(name: string, except: string | null = null): ProfileRef {
  return { kind: "ProfileRef", name, except, loc };
}

describe("import-resolver", () => {
  describe("resolveImports", () => {
    it("resolves inline profiles", () => {
      const profile = makeProfile({ name: "Architect" });
      const refs = [makeRef("Architect")];
      const result = resolveImports([], [profile], refs, () => "", "/fake/file.langc");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Architect");
      expect(result[0].rules).toEqual(["rule1", "rule2"]);
    });

    it("resolves profiles from files", () => {
      const fileContent = `
        PROFILE Security {
          ROLE = "Security Engineer",
          RULES { "validate inputs", "use parameterized queries" },
          PATTERNS { API -> "middleware/" },
          ON_REVIEW { "flag SQL injection" }
        }
      `;
      const imp = makeImport("Security", "./profiles/security.langc");
      const refs = [makeRef("Security")];
      const reader = () => fileContent;

      const result = resolveImports([imp], [], refs, reader, "/project/main.langc");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Security");
      expect(result[0].rules).toContain("validate inputs");
    });

    it("applies EXCEPT filter", () => {
      const profile = makeProfile({
        name: "Architect",
        rules: ["use dependency injection", "separate concerns", "inject auth middleware"],
      });
      const refs = [makeRef("Architect", "auth")];
      const result = resolveImports([], [profile], refs, () => "", "/fake.langc");

      expect(result).toHaveLength(1);
      // "inject auth middleware" should be filtered out
      expect(result[0].rules).toEqual(["use dependency injection", "separate concerns"]);
    });

    it("returns empty for unknown profile refs", () => {
      const refs = [makeRef("NonExistent")];
      const result = resolveImports([], [], refs, () => "", "/fake.langc");
      expect(result).toHaveLength(0);
    });

    it("preserves profile order from refs", () => {
      const p1 = makeProfile({ name: "Architect", role: "Architect" });
      const p2 = makeProfile({ name: "Security", role: "Security" });
      const refs = [makeRef("Security"), makeRef("Architect")];

      const result = resolveImports([], [p1, p2], refs, () => "", "/fake.langc");
      expect(result[0].name).toBe("Security");
      expect(result[1].name).toBe("Architect");
    });

    it("flattens EXTENDS", () => {
      const parent = makeProfile({
        name: "Base",
        rules: ["parent-rule"],
        patterns: [],
        onReview: [],
      });
      const child = makeProfile({
        name: "Extended",
        extends_: ["Base"],
        rules: ["child-rule"],
        patterns: [],
        onReview: [],
      });

      const refs = [makeRef("Extended")];
      const result = resolveImports([], [parent, child], refs, () => "", "/fake.langc");

      expect(result).toHaveLength(1);
      expect(result[0].rules).toContain("parent-rule");
      expect(result[0].rules).toContain("child-rule");
    });

    it("handles missing import files gracefully", () => {
      const imp = makeImport("Missing", "./nonexistent.langc");
      const refs = [makeRef("Missing")];
      const reader = () => { throw new Error("ENOENT"); };

      const result = resolveImports([imp], [], refs, reader, "/fake.langc");
      expect(result).toHaveLength(0);
    });
  });

  describe("resolvePath", () => {
    it("resolves relative paths", () => {
      const result = resolvePath("/project/main.langc", "./profiles/arch.langc");
      expect(result).toBe("project/profiles/arch.langc");
    });

    it("resolves parent directory paths", () => {
      const result = resolvePath("/project/sub/main.langc", "../profiles/arch.langc");
      expect(result).toBe("project/profiles/arch.langc");
    });
  });

  describe("applyExcept", () => {
    it("is case-insensitive", () => {
      const profile: ResolvedProfile = {
        name: "Test",
        role: null,
        rules: ["Use Auth middleware", "validate inputs"],
        patterns: [],
        onReview: [],
      };

      const result = applyExcept(profile, "AUTH");
      expect(result.rules).toEqual(["validate inputs"]);
    });
  });
});
