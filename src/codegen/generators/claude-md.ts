import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";
import { scanReference, formatReferenceScanMd } from "../reference-scanner.js";

export class ClaudeMdGenerator implements Generator {
  name = "claude-md";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const lines: string[] = [];

    lines.push(`# Project: ${ctx.projectName}`);
    lines.push("");

    // Scope
    lines.push("## Scope");
    lines.push(scopeDescription(ctx.scope));
    lines.push("");

    // Context
    if (ctx.projectCtx) {
      lines.push("## Context");
      lines.push(ctx.projectCtx);
      lines.push("");
    }

    // Reference — scan if path provided
    if (ctx.reference !== "none") {
      const scan = scanReference(ctx.reference);
      if (scan) {
        lines.push(formatReferenceScanMd(scan));
      } else {
        lines.push("## Reference Codebase");
        lines.push(`This project extends an existing codebase at \`${ctx.reference}\`.`);
        lines.push(`> **Warning**: Reference path \`${ctx.reference}\` could not be scanned.`);
        lines.push("");
      }
    }

    // Architecture overview
    if (ctx.createBlocks.length > 0) {
      lines.push("## Architecture Overview");
      for (const block of ctx.createBlocks) {
        const lng = getProp(block, "LngProperty");
        const fw = getProp(block, "FrameworkProperty");
        const desc = describeComponent(block, lng, fw);
        lines.push(`- **${block.componentType}.${block.name}** — ${desc}`);
      }
      lines.push("");
    }

    // Dependency order
    if (ctx.dependencyGraph.order.length > 0) {
      lines.push("## Dependency Order");
      let i = 1;
      for (const id of ctx.dependencyGraph.order) {
        const node = ctx.dependencyGraph.nodes.get(id)!;
        const deps = node.dependsOn.length > 0
          ? ` (depends on: ${node.dependsOn.join(", ")})`
          : " (no dependencies)";
        lines.push(`${i}. ${id}${deps}`);
        i++;
      }
      lines.push("");
    }

    // Active profiles
    if (ctx.profiles.length > 0) {
      lines.push("## Active Profiles");
      lines.push("The following expert personas govern all code generation:");
      for (const profile of ctx.profiles) {
        lines.push(`- **${profile.name}** — see \`.claude/agents/${profile.name.toLowerCase()}.md\``);
      }
      lines.push("");
    }

    // Global rules from profiles
    if (ctx.profiles.some(p => p.rules.length > 0)) {
      lines.push("## Global Rules");
      lines.push("> These rules apply to ALL components. Violations must be flagged.");
      lines.push("");

      for (const profile of ctx.profiles) {
        if (profile.rules.length === 0) continue;
        lines.push(`### ${profile.name} Rules`);
        for (const rule of profile.rules) {
          lines.push(`- ${rule}`);
        }
        lines.push("");
      }
    }

    // Build instructions
    if (ctx.createBlocks.length > 0) {
      lines.push("## Build Instructions");
      lines.push("To build this project, execute the skills in dependency order:");
      let i = 1;
      for (const id of ctx.dependencyGraph.order) {
        const node = ctx.dependencyGraph.nodes.get(id)!;
        const skillName = `build-${node.componentType.toLowerCase()}-${node.name}`;
        lines.push(`${i}. \`/${skillName}\``);
        i++;
      }
      lines.push("");
      lines.push("Or use `/orchestrate` to run the full build automatically.");
    }

    return [{
      path: "CLAUDE.md",
      content: lines.join("\n") + "\n",
    }];
  }
}

function scopeDescription(scope: string): string {
  switch (scope) {
    case "full":
      return "Full build — generate complete implementation with all files, tests, and configuration.";
    case "skeleton":
      return "Skeleton build — generate project structure, interfaces, and stubs only.";
    case "prototype":
      return "Prototype build — generate minimal working implementation, skip tests and edge cases.";
    case "update":
      return "Update — modify existing implementation, do not regenerate unchanged components.";
    default:
      return `${scope} build.`;
  }
}

function getProp(block: { properties: Array<{ kind: string; value?: string }> }, kind: string): string | null {
  for (const p of block.properties) {
    if (p.kind === kind && "value" in p) return p.value as string;
  }
  return null;
}

function describeComponent(
  block: { componentType: string; name: string; members: Array<{ kind: string }> },
  lng: string | null,
  fw: string | null,
): string {
  const parts: string[] = [];

  if (lng && fw) {
    parts.push(`${lng}/${fw}`);
  } else if (lng) {
    parts.push(lng);
  }

  const methods = block.members.filter(m => m.kind === "MethodDecl");
  const displays = block.members.filter(m => m.kind === "DisplayDecl");
  const tables = block.members.filter(m => m.kind === "TableDecl");

  if (block.componentType === "API" && methods.length > 0) {
    parts.push(`REST API (${methods.length} endpoints)`);
  } else if (block.componentType === "WEBUI" && displays.length > 0) {
    parts.push(`frontend (${displays.length} views)`);
  } else if (block.componentType === "DB" && tables.length > 0) {
    parts.push(`database (${tables.length} ${tables.length === 1 ? "table" : "tables"})`);
  } else if (block.componentType === "FNC") {
    parts.push("function");
  }

  return parts.join(" ") || block.componentType;
}
