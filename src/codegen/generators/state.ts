import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";
import type { CreateBlock } from "../../ast/nodes.js";
import { computeChecksum } from "../checksum.js";

export class StateGenerator implements Generator {
  name = "state";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // .langc/state.json
    files.push({
      path: ".langc/state.json",
      content: generateStateJson(ctx),
    });

    // .claude/agent-memory/langc/MEMORY.md
    files.push({
      path: ".claude/agent-memory/langc/MEMORY.md",
      content: generateMemoryMd(ctx),
    });

    return files;
  }
}

interface ComponentState {
  status: string;
  type: string;
  name: string;
  path: string;
  checksum: string;
  methods?: string[];
  tables?: string[];
  views?: string[];
  lng?: string;
  framework?: string;
  dependsOn: string[];
}

function generateStateJson(ctx: CompilationContext): string {
  const components: Record<string, ComponentState> = {};

  for (const block of ctx.createBlocks) {
    const id = `${block.componentType}.${block.name}`;
    const lng = getBlockLng(block);
    const fw = getBlockFw(block);

    // Compute checksum from block content (deterministic representation)
    const blockRepr = serializeBlock(block);
    const checksum = computeChecksum(blockRepr);

    // Build component path
    const typePath = block.componentType.toLowerCase();
    const path = `./${ctx.projectName}/${typePath}/${block.name}/`;

    const state: ComponentState = {
      status: "pending",
      type: block.componentType,
      name: block.name,
      path,
      checksum,
      dependsOn: getDependsOn(block),
    };

    if (lng) state.lng = lng;
    if (fw) state.framework = fw;

    // Extract methods
    const methods = block.members
      .filter(m => m.kind === "MethodDecl")
      .map(m => `${(m as { httpMethod: string }).httpMethod} ${(m as { path: string }).path}`);
    if (methods.length > 0) state.methods = methods;

    // Extract tables
    const tables = block.members
      .filter(m => m.kind === "TableDecl")
      .map(m => (m as { name: string }).name);
    if (tables.length > 0) state.tables = tables;

    // Extract views
    const views = block.members
      .filter(m => m.kind === "DisplayDecl")
      .map(m => (m as { description: string }).description);
    if (views.length > 0) state.views = views;

    components[id] = state;
  }

  const state = {
    project: ctx.projectName,
    version: 1,
    compiled_at: new Date().toISOString(),
    scope: ctx.scope,
    gate: ctx.gate,
    profiles_used: Object.fromEntries(
      ctx.profiles.map(p => [p.name, p.version ?? "v1"]),
    ),
    components,
    build_order: ctx.dependencyGraph.order,
    phases: ctx.dependencyGraph.phases,
  };

  return JSON.stringify(state, null, 2) + "\n";
}

function serializeBlock(block: CreateBlock): string {
  // Deterministic string representation for checksum computation
  const parts: string[] = [];
  parts.push(`${block.componentType}:${block.name}`);

  for (const prop of block.properties) {
    if (prop.kind === "LngProperty") parts.push(`lng=${prop.value}`);
    if (prop.kind === "FrameworkProperty") parts.push(`fw=${prop.value}`);
    if (prop.kind === "DependsProperty") {
      parts.push(`deps=${prop.refs.map(r => r.parts.join(".")).join(",")}`);
    }
  }

  for (const member of block.members) {
    if (member.kind === "MethodDecl") {
      parts.push(`method:${member.httpMethod}:${member.path}:${member.description}`);
    } else if (member.kind === "TableDecl") {
      parts.push(`table:${member.name}:${member.columns.map(c => `${c.name}:${c.dataType}`).join(",")}`);
    } else if (member.kind === "DisplayDecl") {
      parts.push(`display:${member.description}`);
    }
  }

  return parts.join("\n");
}

function getDependsOn(block: CreateBlock): string[] {
  const deps: string[] = [];
  for (const prop of block.properties) {
    if (prop.kind === "DependsProperty") {
      for (const ref of prop.refs) {
        const target = ref.parts.join(".");
        if (target !== "none") deps.push(target);
      }
    }
  }
  return deps;
}

function generateMemoryMd(ctx: CompilationContext): string {
  const lines: string[] = [];

  lines.push("# LangC Build Memory");
  lines.push("");
  lines.push(`## Project: ${ctx.projectName}`);
  lines.push(`Last compiled: ${new Date().toISOString().split("T")[0]}`);
  lines.push("");

  // What exists
  lines.push("## Components");
  for (const block of ctx.createBlocks) {
    const lng = getBlockLng(block);
    const fw = getBlockFw(block);
    const memberCount = block.members.length;
    const desc = [lng, fw].filter(Boolean).join("/");

    lines.push(`- ${block.componentType}.${block.name}: ${desc || block.componentType} (${memberCount} members) — pending`);
  }
  lines.push("");

  // Dependency order
  if (ctx.dependencyGraph.order.length > 0) {
    lines.push("## Build Order");
    for (let i = 0; i < ctx.dependencyGraph.order.length; i++) {
      lines.push(`${i + 1}. ${ctx.dependencyGraph.order[i]}`);
    }
    lines.push("");
  }

  // Profiles
  if (ctx.profiles.length > 0) {
    lines.push("## Active Profiles");
    for (const p of ctx.profiles) {
      lines.push(`- ${p.name}${p.role ? ` (${p.role})` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Known Issues");
  lines.push("- None yet");
  lines.push("");

  return lines.join("\n");
}

function getBlockLng(block: { properties: Array<{ kind: string }> }): string | null {
  for (const p of block.properties) {
    if (p.kind === "LngProperty" && "value" in p) return (p as { value: string }).value;
  }
  return null;
}

function getBlockFw(block: { properties: Array<{ kind: string }> }): string | null {
  for (const p of block.properties) {
    if (p.kind === "FrameworkProperty" && "value" in p) return (p as { value: string }).value;
  }
  return null;
}
