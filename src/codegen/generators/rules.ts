import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";

export class RulesGenerator implements Generator {
  name = "rules";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Collect all patterns by component type (lowercase)
    const patternsByType = new Map<string, { dirs: string[]; profileName: string }[]>();

    for (const profile of ctx.profiles) {
      for (const pattern of profile.patterns) {
        const key = pattern.componentType.toLowerCase();
        if (!patternsByType.has(key)) {
          patternsByType.set(key, []);
        }
        patternsByType.get(key)!.push({
          dirs: pattern.pattern.split(/\s+/).filter(Boolean),
          profileName: profile.name,
        });
      }
    }

    // Generate a rules file per component type
    for (const [componentType, entries] of patternsByType) {
      const path = `.claude/rules/${componentType}.md`;
      const content = generateRulesContent(componentType, entries);
      files.push({ path, content });
    }

    return files;
  }
}

function generateRulesContent(
  componentType: string,
  entries: { dirs: string[]; profileName: string }[],
): string {
  const lines: string[] = [];
  const label = componentType.toUpperCase();

  lines.push(`# ${label} Component Rules`);
  lines.push("");
  lines.push(`When working on ${label} components, follow this structure:`);

  // Merge all directories from all profiles
  const allDirs = new Set<string>();
  for (const entry of entries) {
    for (const dir of entry.dirs) {
      allDirs.add(dir);
    }
  }

  for (const dir of allDirs) {
    lines.push(`- \`${dir}\``);
  }
  lines.push("");

  // Note which profiles contributed
  const profileNames = [...new Set(entries.map(e => e.profileName))];
  lines.push(`> Defined by: ${profileNames.join(", ")}`);
  lines.push("");

  return lines.join("\n");
}
