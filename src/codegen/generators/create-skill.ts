import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext, ResolvedProfile } from "../types.js";
import type { CreateBlock, MethodDecl, DisplayDecl, TableDecl } from "../../ast/nodes.js";

export class CreateSkillGenerator implements Generator {
  name = "create-skill";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    for (const block of ctx.createBlocks) {
      const skillName = `build-${block.componentType.toLowerCase()}-${block.name}`;
      const path = `.claude/commands/${skillName}.md`;
      const content = generateSkillContent(block, skillName, ctx);
      files.push({ path, content });
    }

    return files;
  }
}

function generateSkillContent(
  block: CreateBlock,
  skillName: string,
  ctx: CompilationContext,
): string {
  const lng = getBlockProp(block, "LngProperty");
  const fw = getBlockProp(block, "FrameworkProperty");
  const scope = getBlockProp(block, "ScopeProperty") ?? ctx.scope;
  const deps = getBlockDeps(block);

  const lines: string[] = [];

  // Task header
  lines.push(`# Task: Build ${block.componentType} Component "${block.name}"`);
  lines.push("");

  // Specification
  lines.push("## Specification");
  if (lng) lines.push(`- **Language**: ${lng}`);
  if (fw) lines.push(`- **Framework**: ${fw}`);
  lines.push(`- **Scope**: ${scope} (${scopeHint(scope)})`);
  if (deps.length > 0) {
    lines.push(`- **Depends on**: ${deps.join(", ")} (must be built first)`);
  }
  lines.push("");

  // Context
  const blockId = `${block.componentType}.${block.name}`;
  const blockCtxVal = ctx.blockCtx.get(blockId);
  if (ctx.projectCtx || blockCtxVal) {
    lines.push("## Context");
    if (ctx.projectCtx) lines.push(`**Project**: ${ctx.projectCtx}`);
    if (blockCtxVal) lines.push(`**Component**: ${blockCtxVal}`);
    lines.push("");
  }

  // Members
  const methods = block.members.filter((m): m is MethodDecl => m.kind === "MethodDecl");
  const displays = block.members.filter((m): m is DisplayDecl => m.kind === "DisplayDecl");
  const tables = block.members.filter((m): m is TableDecl => m.kind === "TableDecl");

  if (methods.length > 0) {
    lines.push("## Endpoints to Implement");
    lines.push("");
    lines.push("| Method | Path | Auth | Description |");
    lines.push("|--------|------|------|-------------|");
    for (const m of methods) {
      const auth = m.isPublic ? "PUBLIC" : "Required";
      lines.push(`| ${m.httpMethod} | ${m.path} | ${auth} | ${m.description} |`);
    }
    lines.push("");
  }

  if (displays.length > 0) {
    lines.push("## Views to Implement");
    lines.push("");
    lines.push("| Source | Path | Description |");
    lines.push("|--------|------|-------------|");
    for (const d of displays) {
      const source = d.target.parts.join(".");
      const path = d.path ?? "-";
      lines.push(`| ${source} | ${path} | ${d.description} |`);
    }
    lines.push("");
  }

  if (tables.length > 0) {
    for (const table of tables) {
      lines.push(`## Table: ${table.name}`);
      lines.push("");
      lines.push("| Column | Type | Description |");
      lines.push("|--------|------|-------------|");
      for (const col of table.columns) {
        lines.push(`| ${col.name} | ${col.dataType} | ${col.description ?? "-"} |`);
      }
      lines.push("");
    }
  }

  // Profile constraints
  for (const profile of ctx.profiles) {
    const relevantPatterns = profile.patterns.filter(
      p => p.componentType.toUpperCase() === block.componentType,
    );

    if (relevantPatterns.length > 0 || profile.rules.length > 0) {
      lines.push(`## ${profile.name} Constraints`);
      lines.push("");

      if (relevantPatterns.length > 0) {
        lines.push(`Structure the ${block.componentType} as:`);
        lines.push("```");
        for (const p of relevantPatterns) {
          const dirs = p.pattern.split(/\s+/).filter(Boolean);
          for (const dir of dirs) {
            lines.push(`${dir}`);
          }
        }
        lines.push("```");
        lines.push("");
      }
    }
  }

  // Output structure
  const outputDirs = getOutputStructure(block, ctx);
  if (outputDirs.length > 0) {
    lines.push("## Output Structure");
    lines.push("");
    lines.push("```");
    for (const dir of outputDirs) {
      lines.push(dir);
    }
    lines.push("```");
    lines.push("");
  }

  // Done checklist
  lines.push("## Done");
  lines.push("");
  lines.push("This command is complete when:");
  if (methods.length > 0) {
    lines.push(`- [ ] All ${methods.length} endpoints are implemented and return correct responses`);
  }
  if (displays.length > 0) {
    lines.push(`- [ ] All ${displays.length} views render correctly`);
  }
  if (tables.length > 0) {
    lines.push(`- [ ] Database schema is created with all tables and columns`);
  }
  lines.push("- [ ] All profile rules are satisfied");
  lines.push("- [ ] Tests pass");
  lines.push("");

  return lines.join("\n");
}

function getOutputStructure(
  block: CreateBlock,
  ctx: CompilationContext,
): string[] {
  // Check if profiles have PATTERNS for this component type
  for (const profile of ctx.profiles) {
    const relevantPatterns = profile.patterns.filter(
      p => p.componentType.toUpperCase() === block.componentType,
    );
    if (relevantPatterns.length > 0) {
      // Profile patterns take precedence — structure is shown in constraints section
      return [];
    }
  }

  const lng = getBlockProp(block, "LngProperty")?.toLowerCase() ?? "";
  const fw = getBlockProp(block, "FrameworkProperty")?.toLowerCase() ?? "";
  const name = block.name;
  const type = block.componentType;

  if (type === "API" && (lng === "python" || fw === "fastapi")) {
    return [`${name}/app/main.py`, `${name}/app/routers/`, `${name}/app/models/`, `${name}/app/schemas/`, `${name}/tests/`];
  }
  if (type === "API" && lng === "typescript") {
    return [`${name}/src/index.ts`, `${name}/src/routes/`, `${name}/src/models/`, `${name}/tests/`];
  }
  if (type === "DB" && (lng === "postgresql" || lng === "sql")) {
    return [`${name}/schema.sql`, `${name}/migrations/`];
  }
  if (type === "WEBUI" && (fw === "nextjs" || fw === "react")) {
    return [`${name}/app/`, `${name}/components/`, `${name}/lib/`];
  }
  if (type === "FNC") {
    return [`${name}/`, `${name}/tests/`];
  }

  // Fallback
  return [`${name}/src/`];
}

function getBlockProp(block: CreateBlock, kind: string): string | null {
  for (const p of block.properties) {
    if (p.kind === kind && "value" in p) return (p as { value: string }).value;
  }
  return null;
}

function getBlockDeps(block: CreateBlock): string[] {
  const deps: string[] = [];
  for (const p of block.properties) {
    if (p.kind === "DependsProperty") {
      for (const ref of p.refs) {
        deps.push(ref.parts.join("."));
      }
    }
  }
  return deps;
}

function scopeHint(scope: string): string {
  switch (scope) {
    case "full": return "complete implementation with all files";
    case "skeleton": return "structure and stubs only";
    case "prototype": return "minimal working implementation";
    default: return scope;
  }
}
