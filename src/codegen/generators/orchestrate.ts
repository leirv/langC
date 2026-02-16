import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";

export class OrchestrateGenerator implements Generator {
  name = "orchestrate";

  generate(ctx: CompilationContext): GeneratedFile[] {
    if (ctx.createBlocks.length === 0) return [];

    const lines: string[] = [];

    lines.push(`# Orchestration Plan: ${ctx.projectName}`);
    lines.push("");

    // Context
    if (ctx.projectCtx) {
      lines.push("## Context");
      lines.push(ctx.projectCtx);
      lines.push("");
    }

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

    // Done section
    lines.push("## Done");
    lines.push("");
    lines.push("The build is complete when all phases have been executed successfully.");
    lines.push("Verify that each component is working before considering the orchestration finished.");
    lines.push("");

    return [{
      path: ".claude/commands/orchestrate.md",
      content: lines.join("\n"),
    }];
  }
}
