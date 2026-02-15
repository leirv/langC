import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";

export class PlanSkillGenerator implements Generator {
  name = "plan-skill";

  generate(ctx: CompilationContext): GeneratedFile[] {
    if (ctx.createBlocks.length === 0) return [];

    const lines: string[] = [];

    // YAML frontmatter
    lines.push("---");
    lines.push("name: plan");
    lines.push(`description: Review the build plan for ${ctx.projectName} before execution.`);
    lines.push("  Shows dependency order, profile checks, and gate mode.");
    lines.push("user-invocable: true");
    lines.push("allowed-tools: Read, Glob, Grep");
    lines.push("---");
    lines.push("");

    lines.push(`# Build Plan Review: ${ctx.projectName}`);
    lines.push("");

    // Phases
    lines.push("## Execution Phases");
    lines.push("");
    for (let i = 0; i < ctx.dependencyGraph.phases.length; i++) {
      const phase = ctx.dependencyGraph.phases[i];
      lines.push(`### Phase ${i + 1}`);
      for (const id of phase) {
        const node = ctx.dependencyGraph.nodes.get(id)!;
        const block = ctx.createBlocks.find(
          b => b.componentType === node.componentType && b.name === node.name,
        );
        const memberCount = block?.members.length ?? 0;
        const lng = block?.properties.find(p => p.kind === "LngProperty");
        const lngStr = lng && "value" in lng ? ` (${(lng as { value: string }).value})` : "";
        lines.push(`- **${id}**${lngStr} — ${memberCount} members`);
      }
      lines.push("");
    }

    // Profile review
    if (ctx.profiles.length > 0) {
      lines.push("## Profile Review");
      lines.push("");
      lines.push("Run each profile's ON_REVIEW checks against the plan:");
      lines.push("");

      for (const profile of ctx.profiles) {
        lines.push(`### ${profile.name}`);
        if (profile.onReview.length > 0) {
          lines.push("Check:");
          for (const item of profile.onReview) {
            lines.push(`- [ ] ${item}`);
          }
        } else {
          lines.push("No ON_REVIEW checks defined.");
        }
        lines.push("");
      }
    }

    // Gate mode
    lines.push("## Gate Mode");
    lines.push("");
    lines.push(`Current: **${ctx.gate}**`);
    lines.push("");
    lines.push("| Mode | Behavior |");
    lines.push("|------|----------|");
    lines.push("| manual | Stop after every phase for human approval |");
    lines.push("| phase-by-phase | Stop between dependency phases |");
    lines.push("| auto | Run everything, stop only on errors |");
    lines.push("| confirm-on-warning | Run automatically, stop on warnings |");
    lines.push("");

    // Next step
    lines.push("## Next Step");
    lines.push("");
    lines.push("If the plan looks correct, run `/orchestrate` to execute the build.");
    lines.push("");

    return [{
      path: ".claude/skills/plan/SKILL.md",
      content: lines.join("\n"),
    }];
  }
}
