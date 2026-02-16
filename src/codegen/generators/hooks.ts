import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext, ResolvedProfile } from "../types.js";

export class HooksGenerator implements Generator {
  name = "hooks";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Collect all profiles that have onReview rules
    const reviewProfiles = ctx.profiles.filter(p => p.onReview.length > 0);
    if (reviewProfiles.length === 0) return files;

    // Generate settings.json (Stop hook + permissions only — no PostToolUse)
    const settingsContent = generateSettings(reviewProfiles, ctx);
    files.push({ path: ".claude/settings.json", content: settingsContent });

    return files;
  }
}

function generatePermissions(ctx: CompilationContext): { allow: string[]; deny: string[] } {
  const allow: string[] = [];
  const deny: string[] = [];
  const projectDir = `./${ctx.projectName}`;

  // Allow reading everything
  allow.push("Read(./**)");

  // Allow writing/editing within the project directory
  allow.push(`Write(${projectDir}/**)`);
  allow.push(`Edit(${projectDir}/**)`);

  // Allow common build/test commands based on LNG
  const lngs = new Set<string>();
  for (const block of ctx.createBlocks) {
    for (const prop of block.properties) {
      if (prop.kind === "LngProperty") lngs.add(prop.value.toLowerCase());
    }
  }

  if (lngs.has("python")) {
    allow.push("Bash(pytest *)");
    allow.push("Bash(ruff check *)");
    allow.push("Bash(pip install *)");
  }
  if (lngs.has("react") || lngs.has("typescript") || lngs.has("javascript")) {
    allow.push("Bash(npm test *)");
    allow.push("Bash(npm run *)");
    allow.push("Bash(npx *)");
  }
  if (lngs.has("go")) {
    allow.push("Bash(go test *)");
    allow.push("Bash(go build *)");
  }
  if (lngs.has("rust")) {
    allow.push("Bash(cargo test *)");
    allow.push("Bash(cargo build *)");
  }

  // Deny dangerous operations
  deny.push("Bash(rm -rf *)");
  deny.push("Write(./.env*)");
  deny.push("Edit(./.env*)");
  deny.push("Write(./**/credentials*)");
  deny.push("Write(./**/*.pem)");

  return { allow, deny };
}

function generateSettings(
  reviewProfiles: ResolvedProfile[],
  ctx: CompilationContext,
): string {
  // Build the Stop hook prompt from all review rules
  const allReviewItems = reviewProfiles.flatMap(p =>
    p.onReview.map(r => `(${p.name}) ${r}`),
  );

  const stopPrompt = [
    "Review all files created/modified in this session. Check:",
    ...allReviewItems.map((item, i) => `(${i + 1}) ${item}`),
    "Report violations as ✗, warnings as ⚠, passes as ✓.",
  ].join(" ");

  const permissions = generatePermissions(ctx);

  const settings: Record<string, unknown> = {
    permissions,
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "agent",
              prompt: stopPrompt,
              timeout: 120,
            },
          ],
        },
      ],
    },
  };

  return JSON.stringify(settings, null, 2) + "\n";
}
