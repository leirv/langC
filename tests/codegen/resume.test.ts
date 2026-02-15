import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getResumeInfo } from "../../src/codegen/incremental.js";

const testDir = join(process.cwd(), "__test_resume__");

function setup() {
  mkdirSync(join(testDir, ".langc"), { recursive: true });
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe("resume from partial builds", () => {
  beforeEach(() => {
    cleanup();
    setup();
  });
  afterEach(cleanup);

  it("returns canResume=false when no state exists", () => {
    const info = getResumeInfo(join(testDir, "nonexistent"));
    expect(info.canResume).toBe(false);
    expect(info.completedPhases).toHaveLength(0);
    expect(info.nextPhase).toBeNull();
  });

  it("returns canResume=false when no phases are completed", () => {
    writeFileSync(join(testDir, ".langc", "state.json"), JSON.stringify({
      components: {
        "DB.data": { checksum: "abc", status: "pending" },
      },
      phase_status: [
        { phase: 1, components: ["DB.data"], status: "pending" },
        { phase: 2, components: ["API.svc"], status: "pending" },
      ],
    }));

    const info = getResumeInfo(testDir);
    expect(info.canResume).toBe(false);
    expect(info.completedPhases).toHaveLength(0);
    expect(info.nextPhase).toBe(1);
  });

  it("detects partially completed build and identifies next phase", () => {
    writeFileSync(join(testDir, ".langc", "state.json"), JSON.stringify({
      components: {
        "DB.data": { checksum: "abc", status: "completed" },
        "API.svc": { checksum: "def", status: "pending" },
      },
      phase_status: [
        { phase: 1, components: ["DB.data"], status: "completed" },
        { phase: 2, components: ["API.svc"], status: "pending" },
      ],
    }));

    const info = getResumeInfo(testDir);
    expect(info.canResume).toBe(true);
    expect(info.completedPhases).toEqual([1]);
    expect(info.nextPhase).toBe(2);
    expect(info.completedComponents).toEqual(["DB.data"]);
  });

  it("returns canResume=false when all phases completed", () => {
    writeFileSync(join(testDir, ".langc", "state.json"), JSON.stringify({
      components: {
        "DB.data": { checksum: "abc", status: "completed" },
        "API.svc": { checksum: "def", status: "completed" },
      },
      phase_status: [
        { phase: 1, components: ["DB.data"], status: "completed" },
        { phase: 2, components: ["API.svc"], status: "completed" },
      ],
    }));

    const info = getResumeInfo(testDir);
    expect(info.canResume).toBe(false);
    expect(info.completedPhases).toEqual([1, 2]);
    expect(info.nextPhase).toBeNull();
  });

  it("handles legacy state without phase_status", () => {
    writeFileSync(join(testDir, ".langc", "state.json"), JSON.stringify({
      components: {
        "DB.data": { checksum: "abc", status: "completed" },
        "API.svc": { checksum: "def", status: "pending" },
      },
    }));

    const info = getResumeInfo(testDir);
    expect(info.canResume).toBe(true);
    expect(info.completedComponents).toContain("DB.data");
  });
});
