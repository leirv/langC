import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";

export class OrchestrateGenerator implements Generator {
  name = "orchestrate";

  generate(ctx: CompilationContext): GeneratedFile[] {
    if (ctx.createBlocks.length === 0) return [];

    const lines: string[] = [];

    // YAML frontmatter
    lines.push("---");
    lines.push("name: orchestrate");
    lines.push(`description: Runs the full ${ctx.projectName} build in dependency order.`);
    lines.push("  Dispatches independent components in parallel via subagents.");
    lines.push("user-invocable: true");
    lines.push("allowed-tools: Read, Write, Edit, Bash, Glob, Grep");
    lines.push("---");
    lines.push("");

    lines.push(`# Orchestration Plan: ${ctx.projectName}`);
    lines.push("");

    // Dependency graph visualization
    lines.push("## Dependency Graph");
    lines.push("");
    lines.push("```");
    for (const id of ctx.dependencyGraph.order) {
      const node = ctx.dependencyGraph.nodes.get(id)!;
      if (node.dependsOn.length > 0) {
        lines.push(`${node.dependsOn.join(", ")} ──> ${id}`);
      } else {
        lines.push(`${id} (root)`);
      }
    }
    lines.push("```");
    lines.push("");

    // Execution steps by phase
    lines.push("## Execution Steps");
    lines.push("");

    for (let i = 0; i < ctx.dependencyGraph.phases.length; i++) {
      const phase = ctx.dependencyGraph.phases[i];
      const phaseNum = i + 1;
      const isParallel = phase.length > 1;

      lines.push(`### Phase ${phaseNum}${isParallel ? " (Parallel)" : ""}`);

      for (const id of phase) {
        const node = ctx.dependencyGraph.nodes.get(id)!;
        const skillName = `build-${node.componentType.toLowerCase()}-${node.name}`;
        lines.push(`Execute: \`/${skillName}\``);
      }

      if (i < ctx.dependencyGraph.phases.length - 1) {
        lines.push("Wait for completion before proceeding.");
      } else {
        lines.push("Wait for completion.");
      }
      lines.push("");
    }

    // Post-build verification
    if (ctx.profiles.length > 0) {
      lines.push("## Post-Build Verification");
      lines.push("");
      lines.push("After all phases complete:");
      for (const profile of ctx.profiles) {
        lines.push(`1. Delegate to \`${profile.name.toLowerCase()}\` agent: "Review the full project for ${profile.name.toLowerCase()}-level concerns"`);
      }
      lines.push("");
    }

    // State update
    lines.push("## State Update");
    lines.push("");
    lines.push("After successful build, update `.langc/state.json` with:");
    lines.push("- Component statuses");
    lines.push("- File paths created");
    lines.push("- Timestamps");
    lines.push("");

    return [{
      path: ".claude/skills/orchestrate/SKILL.md",
      content: lines.join("\n"),
    }];
  }
}
