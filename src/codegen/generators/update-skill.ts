import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";
import type { UpdateBlock, AddMethodDecl, AddDisplayDecl, RemoveMethodDecl } from "../../ast/nodes.js";

export class UpdateSkillGenerator implements Generator {
  name = "update-skill";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    for (const block of ctx.updateBlocks) {
      const target = block.target.parts;
      const typeName = target[0]?.toLowerCase() ?? "unknown";
      const componentName = target.slice(1).join("-") || "unknown";
      const skillName = `update-${typeName}-${componentName}`;
      const path = `.claude/commands/${skillName}.md`;
      const content = generateUpdateContent(block, skillName, ctx);
      files.push({ path, content });
    }

    return files;
  }
}

function generateUpdateContent(
  block: UpdateBlock,
  skillName: string,
  ctx: CompilationContext,
): string {
  const target = block.target.parts.join(".");
  const lines: string[] = [];

  lines.push(`# Task: Update Component "${target}"`);
  lines.push("");

  // Reference
  lines.push("## Reference");
  lines.push("Read the existing implementation first before making changes.");
  lines.push("");

  // Changes
  const adds = block.members.filter((m): m is AddMethodDecl => m.kind === "AddMethodDecl");
  const addDisplays = block.members.filter((m): m is AddDisplayDecl => m.kind === "AddDisplayDecl");
  const removes = block.members.filter((m): m is RemoveMethodDecl => m.kind === "RemoveMethodDecl");

  if (adds.length > 0 || addDisplays.length > 0) {
    lines.push("## Additions");
    lines.push("");

    let i = 1;
    for (const add of adds) {
      const m = add.method;
      lines.push(`### New Endpoint ${i}: ${m.httpMethod} ${m.path}`);
      lines.push(`- **Method**: ${m.httpMethod}`);
      lines.push(`- **Path**: ${m.path}`);
      lines.push(`- **Behavior**: ${m.description}`);
      if (m.isPublic) lines.push("- **Auth**: PUBLIC (no authentication required)");
      lines.push("");
      i++;
    }

    for (const add of addDisplays) {
      const d = add.display;
      lines.push(`### New View ${i}: ${d.target.parts.join(".")}`);
      lines.push(`- **Source**: ${d.target.parts.join(".")}`);
      if (d.path) lines.push(`- **Path**: ${d.path}`);
      lines.push(`- **Description**: ${d.description}`);
      lines.push("");
      i++;
    }
  }

  if (removes.length > 0) {
    lines.push("## Removals");
    lines.push("");
    for (const rm of removes) {
      lines.push(`- Remove **${rm.httpMethod} ${rm.path}**`);
    }
    lines.push("");
  }

  // Constraints
  lines.push("## Constraints");
  lines.push("All active profile rules still apply. Follow the same patterns used in the existing implementation.");
  lines.push("");

  // Completion
  lines.push("## Completion Criteria");
  lines.push("- [ ] Changes work without breaking existing functionality");
  lines.push("- [ ] All existing tests still pass");
  lines.push("- [ ] New tests added for new functionality");
  lines.push("");

  return lines.join("\n");
}
