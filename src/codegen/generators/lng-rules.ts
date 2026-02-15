import type { Generator } from "../generator.js";
import type { GeneratedFile, CompilationContext } from "../types.js";

/** Language convention rules keyed by lowercase language name. */
const lngConventions: Record<string, string[]> = {
  python: [
    "Use type hints on all function signatures",
    "Follow PEP 8 style conventions",
    "Use virtual environments for dependency isolation",
    "Prefer f-strings over string concatenation",
    "Use `pathlib` for file path operations",
  ],
  postgresql: [
    "Use lowercase for table and column names",
    "Use snake_case naming convention",
    "Always define primary keys",
    "Use appropriate data types (avoid text for everything)",
    "Add indexes on frequently queried columns",
  ],
  react: [
    "Use functional components with hooks",
    "Prefer named exports over default exports",
    "Keep components small and focused",
    "Use TypeScript for type safety",
    "Colocate styles with components",
  ],
  typescript: [
    "Enable strict mode in tsconfig",
    "Use explicit return types on public functions",
    "Prefer interfaces over type aliases for object shapes",
    "Use const assertions where applicable",
    "Avoid `any` — use `unknown` when type is uncertain",
  ],
  javascript: [
    "Use ES modules (import/export) over CommonJS",
    "Prefer const over let, avoid var",
    "Use template literals for string interpolation",
    "Handle promises with async/await over .then() chains",
  ],
  go: [
    "Follow standard Go project layout",
    "Use error wrapping with fmt.Errorf and %w",
    "Keep interfaces small — prefer single-method interfaces",
    "Use context.Context for cancellation and timeouts",
    "Run gofmt and golint before committing",
  ],
  rust: [
    "Use Result<T, E> for fallible operations",
    "Prefer &str over String for function parameters",
    "Use clippy for linting",
    "Follow the Rust API guidelines for naming",
    "Minimize unsafe blocks",
  ],
  java: [
    "Follow Maven/Gradle standard project layout",
    "Use dependency injection (Spring or manual)",
    "Prefer composition over inheritance",
    "Use Optional instead of null returns",
    "Follow Google Java Style Guide",
  ],
};

export class LngRulesGenerator implements Generator {
  name = "lng-rules";

  generate(ctx: CompilationContext): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Collect unique languages from CREATE blocks
    const languages = new Set<string>();
    for (const block of ctx.createBlocks) {
      for (const prop of block.properties) {
        if (prop.kind === "LngProperty") {
          languages.add(prop.value.toLowerCase());
        }
      }
    }

    for (const lng of languages) {
      const conventions = lngConventions[lng];
      if (!conventions) continue;

      const lines: string[] = [];
      lines.push(`# ${capitalize(lng)} Language Conventions`);
      lines.push("");
      lines.push(`When writing ${capitalize(lng)} code, follow these conventions:`);
      for (const rule of conventions) {
        lines.push(`- ${rule}`);
      }
      lines.push("");

      // Note which components use this language
      const users: string[] = [];
      for (const block of ctx.createBlocks) {
        for (const prop of block.properties) {
          if (prop.kind === "LngProperty" && prop.value.toLowerCase() === lng) {
            users.push(`${block.componentType}.${block.name}`);
          }
        }
      }
      lines.push(`> Used by: ${users.join(", ")}`);
      lines.push("");

      files.push({
        path: `.claude/rules/${lng}.md`,
        content: lines.join("\n"),
      });
    }

    return files;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
