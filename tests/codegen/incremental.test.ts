import { describe, it, expect } from "vitest";
import { computeIncremental } from "../../src/codegen/incremental.js";
import { computeChecksum } from "../../src/codegen/checksum.js";
import type { CreateBlock } from "../../src/ast/nodes.js";

const loc = { line: 1, column: 1 };

function makeBlock(type: string, name: string, lng = "python"): CreateBlock {
  return {
    kind: "CreateBlock",
    componentType: type as CreateBlock["componentType"],
    name,
    properties: [{ kind: "LngProperty", value: lng, loc }],
    members: [],
    loc,
  };
}

function serializeBlock(block: CreateBlock): string {
  const parts: string[] = [];
  parts.push(`${block.componentType}:${block.name}`);
  for (const prop of block.properties) {
    if (prop.kind === "LngProperty") parts.push(`lng=${prop.value}`);
    if (prop.kind === "FrameworkProperty") parts.push(`fw=${prop.value}`);
  }
  return parts.join("\n");
}

describe("incremental compilation", () => {
  it("all components are added when no previous state", () => {
    const blocks = [makeBlock("DB", "data"), makeBlock("API", "svc")];
    const result = computeIncremental(blocks, null);

    expect(result.added).toEqual(["DB.data", "API.svc"]);
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("detects unchanged components", () => {
    const block = makeBlock("DB", "data");
    const checksum = computeChecksum(serializeBlock(block));

    const prevState = {
      components: {
        "DB.data": { checksum, status: "pending" },
      },
    };

    const result = computeIncremental([block], prevState);
    expect(result.unchanged).toEqual(["DB.data"]);
    expect(result.changed).toHaveLength(0);
    expect(result.added).toHaveLength(0);
  });

  it("detects changed components", () => {
    const block = makeBlock("DB", "data", "postgresql");

    const prevState = {
      components: {
        "DB.data": { checksum: "old_checksum_", status: "pending" },
      },
    };

    const result = computeIncremental([block], prevState);
    expect(result.changed).toEqual(["DB.data"]);
    expect(result.unchanged).toHaveLength(0);
  });

  it("detects added components", () => {
    const blocks = [makeBlock("DB", "data"), makeBlock("API", "svc")];
    const checksum = computeChecksum(serializeBlock(blocks[0]));

    const prevState = {
      components: {
        "DB.data": { checksum, status: "pending" },
      },
    };

    const result = computeIncremental(blocks, prevState);
    expect(result.added).toEqual(["API.svc"]);
    expect(result.unchanged).toEqual(["DB.data"]);
  });

  it("detects removed components", () => {
    const blocks = [makeBlock("DB", "data")];
    const checksum = computeChecksum(serializeBlock(blocks[0]));

    const prevState = {
      components: {
        "DB.data": { checksum, status: "pending" },
        "API.svc": { checksum: "abc123def456", status: "pending" },
      },
    };

    const result = computeIncremental(blocks, prevState);
    expect(result.removed).toEqual(["API.svc"]);
    expect(result.unchanged).toEqual(["DB.data"]);
  });

  it("handles mixed scenario", () => {
    const blocks = [
      makeBlock("DB", "data"),           // unchanged
      makeBlock("API", "svc", "go"),     // changed (was python)
      makeBlock("WEBUI", "ui"),          // added
    ];

    const dbChecksum = computeChecksum(serializeBlock(blocks[0]));

    const prevState = {
      components: {
        "DB.data": { checksum: dbChecksum, status: "pending" },
        "API.svc": { checksum: "stale_chksum_", status: "pending" },
        "FNC.cleanup": { checksum: "func_chksum_", status: "pending" },
      },
    };

    const result = computeIncremental(blocks, prevState);
    expect(result.unchanged).toEqual(["DB.data"]);
    expect(result.changed).toEqual(["API.svc"]);
    expect(result.added).toEqual(["WEBUI.ui"]);
    expect(result.removed).toEqual(["FNC.cleanup"]);
  });

  it("CTX change triggers recompilation", () => {
    const block: CreateBlock = {
      kind: "CreateBlock",
      componentType: "API" as CreateBlock["componentType"],
      name: "svc",
      properties: [
        { kind: "LngProperty", value: "python", loc },
        { kind: "CtxProperty", value: "Identity service.", loc },
      ],
      members: [],
      loc,
    };

    // Previous state with old checksum (no CTX)
    const prevState = {
      components: {
        "API.svc": { checksum: "stale_checksum", status: "pending" },
      },
    };

    const result = computeIncremental([block], prevState);
    expect(result.changed).toEqual(["API.svc"]);
  });
});
