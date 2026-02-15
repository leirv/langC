import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext, ResolvedProfile } from "../types.js";

export class AgentGenerator implements Generator {
  name = "agent";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    for (const profile of ctx.profiles) {
      const fileName = profile.name.toLowerCase();
      const path = `.claude/agents/${fileName}.md`;
      const content = generateAgentContent(profile);
      files.push({ path, content });
    }

    return files;
  }
}

function generateAgentContent(profile: ResolvedProfile): string {
  const lines: string[] = [];
  const name = profile.name.toLowerCase();

  // YAML frontmatter
  lines.push("---");
  lines.push(`name: ${name}`);
  if (profile.role) {
    lines.push(`description: ${profile.role} — reviews and enforces quality standards.`);
    lines.push(`  Delegate to this agent when reviewing code for ${name}-level concerns.`);
  } else {
    lines.push(`description: ${profile.name} profile agent.`);
  }
  lines.push("tools: Read, Glob, Grep");
  lines.push("disallowedTools: Write, Edit, Bash");
  lines.push("model: sonnet");
  lines.push("maxTurns: 15");
  lines.push("memory: project");
  lines.push("---");
  lines.push("");

  // Role
  lines.push("# Role");
  lines.push("");
  if (profile.role) {
    lines.push(`You are a ${profile.role}. Your job is to review code and plans`);
    lines.push("for quality and compliance with your rules.");
  } else {
    lines.push(`You are the ${profile.name} reviewer.`);
  }
  lines.push("");

  // Rules
  if (profile.rules.length > 0) {
    lines.push("# Rules You Enforce");
    lines.push("");
    for (const rule of profile.rules) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  // Patterns
  if (profile.patterns.length > 0) {
    lines.push("# Structural Patterns You Expect");
    lines.push("");
    for (const p of profile.patterns) {
      lines.push(`When reviewing a ${p.componentType} component, expect this structure:`);
      const dirs = p.pattern.split(/\s+/).filter(Boolean);
      for (const dir of dirs) {
        lines.push(`- \`${dir}\``);
      }
      lines.push("");
    }
  }

  // Review checklist
  if (profile.onReview.length > 0) {
    lines.push("# Review Checklist");
    lines.push("");
    lines.push("When asked to review, check for:");
    for (const item of profile.onReview) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  // Output format
  lines.push("# Output Format");
  lines.push("");
  lines.push("Return your review as:");
  lines.push("- ✓ for passing checks");
  lines.push("- ⚠ for warnings (suggest improvement)");
  lines.push("- ✗ for violations (must fix before proceeding)");
  lines.push("");

  return lines.join("\n");
}
