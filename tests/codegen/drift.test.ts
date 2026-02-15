import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { detectDrift, formatDriftReport } from "../../src/codegen/drift.js";
import { computeChecksum } from "../../src/codegen/checksum.js";

const testDir = join(process.cwd(), "__test_drift__");

function setup() {
  mkdirSync(join(testDir, ".langc", "checksums"), { recursive: true });
  mkdirSync(join(testDir, ".claude", "skills", "build-db-data"), { recursive: true });
  mkdirSync(join(testDir, ".claude", "skills", "build-api-svc"), { recursive: true });
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe("drift detection", () => {
  beforeEach(() => {
    cleanup();
    setup();
  });
  afterEach(cleanup);

  it("returns no drift when no state.json exists", () => {
    const result = detectDrift(testDir);
    expect(result.hasDrift).toBe(false);
    expect(result.drifted).toHaveLength(0);
  });

  it("returns no drift when files match checksums", () => {
    const skillContent = "# SKILL.md for DB.data\nSome content here";
    const fileChecksum = computeChecksum(skillContent);

    // Write state
    writeFileSync(join(testDir, ".langc", "state.json"), JSON.stringify({
      components: {
        "DB.data": { checksum: "source_abc", status: "pending" },
      },
    }));

    // Write SKILL.md
    writeFileSync(join(testDir, ".claude", "skills", "build-db-data", "SKILL.md"), skillContent);

    // Write checksum file matching the SKILL.md content
    writeFileSync(join(testDir, ".langc", "checksums", "DB.data.checksum"), fileChecksum);

    const result = detectDrift(testDir);
    expect(result.hasDrift).toBe(false);
    expect(result.clean).toContain("DB.data");
  });

  it("detects drift when file content differs from checksum", () => {
    const originalContent = "# SKILL.md for DB.data\nOriginal content";
    const modifiedContent = "# SKILL.md for DB.data\nHand-edited content!";
    const originalChecksum = computeChecksum(originalContent);

    writeFileSync(join(testDir, ".langc", "state.json"), JSON.stringify({
      components: {
        "DB.data": { checksum: "source_abc", status: "pending" },
      },
    }));

    // Write the modified file
    writeFileSync(join(testDir, ".claude", "skills", "build-db-data", "SKILL.md"), modifiedContent);

    // Checksum file has the original checksum
    writeFileSync(join(testDir, ".langc", "checksums", "DB.data.checksum"), originalChecksum);

    const result = detectDrift(testDir);
    expect(result.hasDrift).toBe(true);
    expect(result.drifted).toHaveLength(1);
    expect(result.drifted[0].id).toBe("DB.data");
  });

  it("reports missing SKILL.md files", () => {
    writeFileSync(join(testDir, ".langc", "state.json"), JSON.stringify({
      components: {
        "DB.data": { checksum: "abc", status: "pending" },
        "FNC.cleanup": { checksum: "def", status: "pending" },
      },
    }));

    // Only DB.data has a SKILL.md, FNC.cleanup does not
    writeFileSync(join(testDir, ".claude", "skills", "build-db-data", "SKILL.md"), "content");

    const result = detectDrift(testDir);
    expect(result.missing).toContain("FNC.cleanup");
  });

  it("formats drift report correctly", () => {
    const result = {
      hasDrift: true,
      drifted: [{
        id: "DB.data",
        expectedChecksum: "abc",
        actualChecksum: "def",
        path: "/test/.claude/skills/build-db-data/SKILL.md",
      }],
      clean: [],
      missing: ["API.svc"],
    };

    const lines = formatDriftReport(result);
    expect(lines.some(l => l.includes("Drift detected"))).toBe(true);
    expect(lines.some(l => l.includes("DB.data"))).toBe(true);
    expect(lines.some(l => l.includes("Missing"))).toBe(true);
    expect(lines.some(l => l.includes("API.svc"))).toBe(true);
  });

  it("formats clean report when no drift", () => {
    const result = { hasDrift: false, drifted: [], clean: ["DB.data"], missing: [] };
    const lines = formatDriftReport(result);
    expect(lines[0]).toContain("No drift detected");
  });
});
