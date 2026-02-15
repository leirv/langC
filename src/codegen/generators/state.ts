import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";

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

function generateStateJson(ctx: CompilationContext): string {
  const components: Record<string, { status: string; type: string; name: string }> = {};

  for (const block of ctx.createBlocks) {
    const id = `${block.componentType}.${block.name}`;
    components[id] = {
      status: "pending",
      type: block.componentType,
      name: block.name,
    };
  }

  const state = {
    project: ctx.projectName,
    version: 1,
    compiled_at: new Date().toISOString(),
    scope: ctx.scope,
    profiles_used: Object.fromEntries(
      ctx.profiles.map(p => [p.name, p.version ?? "v1"]),
    ),
    components,
  };

  return JSON.stringify(state, null, 2) + "\n";
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
