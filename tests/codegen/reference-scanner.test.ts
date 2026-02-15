import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scanReference, formatReferenceScanMd } from "../../src/codegen/reference-scanner.js";

const TEST_DIR = join(process.cwd(), "__test_ref__");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function createFile(relPath: string, content = ""): void {
  const full = join(TEST_DIR, relPath);
  const dir = full.replace(/[/\\][^/\\]*$/, "");
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content);
}

describe("reference scanner", () => {
  it("returns null for non-existent path", () => {
    const result = scanReference("/nonexistent/path/nowhere");
    expect(result).toBeNull();
  });

  it("scans a simple Python project", () => {
    createFile("app/__init__.py");
    createFile("app/routes/users.py", "# routes");
    createFile("app/models/user.py", "# model");
    createFile("tests/test_users.py", "# test");
    createFile("requirements.txt", "fastapi\nuvicorn\n");

    const scan = scanReference(TEST_DIR);
    expect(scan).not.toBeNull();
    expect(scan!.detectedStack.languages).toContain("Python");
    expect(scan!.fileTree.length).toBeGreaterThan(0);
    expect(scan!.conventions).toContain("Tests in tests/ directory");
  });

  it("detects TypeScript + React project", () => {
    createFile("src/App.tsx", "// app");
    createFile("src/components/Header.tsx", "// header");
    createFile("src/hooks/useAuth.ts", "// hook");
    createFile("tsconfig.json", "{}");
    createFile("package.json", '{"name":"app"}');

    const scan = scanReference(TEST_DIR);
    expect(scan!.detectedStack.languages).toContain("TypeScript (React)");
    expect(scan!.detectedStack.buildTools).toContain("TypeScript");
    expect(scan!.conventions).toContain("Source code in src/ directory");
    expect(scan!.conventions).toContain("Component-based architecture");
  });

  it("ignores node_modules and .git", () => {
    createFile("src/index.ts", "// code");
    createFile("node_modules/pkg/index.js", "// dep");

    const scan = scanReference(TEST_DIR);
    expect(scan!.fileTree.some(f => f.includes("node_modules"))).toBe(false);
  });

  it("detects Docker and build tools", () => {
    createFile("Dockerfile", "FROM node:18");
    createFile("Makefile", "build:");
    createFile("src/main.go", "package main");

    const scan = scanReference(TEST_DIR);
    expect(scan!.detectedStack.buildTools).toContain("Docker");
    expect(scan!.detectedStack.buildTools).toContain("Make");
    expect(scan!.detectedStack.languages).toContain("Go");
  });

  it("formatReferenceScanMd produces markdown", () => {
    createFile("app/main.py", "# app");
    createFile("tests/test_main.py", "# test");

    const scan = scanReference(TEST_DIR)!;
    const md = formatReferenceScanMd(scan);

    expect(md).toContain("## Reference Codebase Analysis");
    expect(md).toContain("### Detected Stack");
    expect(md).toContain("### Existing File Tree");
    expect(md).toContain("match the existing patterns");
  });

  it("detects testing frameworks", () => {
    createFile("jest.config.js", "module.exports = {}");
    createFile("src/index.ts", "// code");

    const scan = scanReference(TEST_DIR);
    expect(scan!.detectedStack.testing).toContain("Jest");
  });

  it("detects database tooling", () => {
    createFile("alembic.ini", "[alembic]");
    createFile("migrations/001_init.py", "# migration");
    createFile("app/models/user.py", "# model");

    const scan = scanReference(TEST_DIR);
    expect(scan!.detectedStack.database).toContain("Alembic (SQLAlchemy)");
    expect(scan!.conventions).toContain("Database migrations present");
  });
});
