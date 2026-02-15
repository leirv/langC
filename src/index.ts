import { existsSync, readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { formatDiagnostics, printDiagnostics } from "./errors/diagnostics.js";
import { Compiler } from "./codegen/compiler.js";
import { writeFiles } from "./codegen/writer.js";
import { semanticValidate } from "./codegen/validator.js";
import type { ValidationResult } from "./codegen/validator.js";
import type { CompilationContext, GeneratedFile } from "./codegen/types.js";
import type { IncrementalResult } from "./codegen/incremental.js";
import type { Program, CreateBlock } from "./ast/nodes.js";
import { boxTop, boxBottom, boxSep, boxLine, boxEmpty, checkMark, warnMark } from "./cli/format.js";

function usage(): void {
  console.log(`Usage: langc <command> <file> [options]

Commands:
  validate <file>               Semantic validation (syntax + logic checks)
  plan <file>                   Show build plan with phase breakdown
  compile <file>                Compile to .claude/ artifacts
  apply <file> [--gate=MODE]    Compile and show phase execution plan`);
}

function readSource(filePath: string): string {
  const abs = resolve(filePath);
  return readFileSync(abs, "utf-8");
}

// ── VALIDATE ──────────────────────────────────────────

function validate(filePath: string): number {
  const source = readSource(filePath);

  // Step 1: Syntax check
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { ast, errors: parseErrors } = new Parser(tokens).parse();
  const diagnostics = formatDiagnostics(filePath, lexErrors, parseErrors);

  if (diagnostics.length > 0) {
    console.log(boxTop(`Validation: ${basename(filePath)}`));
    console.log(boxEmpty());
    console.log(boxLine(`${checkMark(false)} Syntax errors found`));
    console.log(boxEmpty());
    for (const d of diagnostics) {
      const msg = `  ${d.line}:${d.column} ${d.message}`;
      console.log(boxLine(msg.length > 51 ? msg.slice(0, 48) + "..." : msg));
    }
    console.log(boxEmpty());
    console.log(boxLine(`${diagnostics.length} syntax error(s). Fix before proceeding.`));
    console.log(boxBottom());
    return 1;
  }

  // Step 2: Semantic validation (with resolved profiles for deep checks)
  const absPath = resolve(filePath);
  const fileExists = (path: string) => existsSync(path);
  let resolvedProfiles: import("./codegen/types.js").ResolvedProfile[] | undefined;
  try {
    const compiler = new Compiler();
    const { context } = compiler.compile(filePath);
    resolvedProfiles = context.profiles;
  } catch {
    // If compilation fails, proceed without resolved profiles
  }
  const result = semanticValidate(ast, fileExists, absPath, resolvedProfiles);

  console.log(boxTop(`Validation: ${basename(filePath)}`));
  console.log(boxEmpty());

  // Show check results
  for (const check of result.checks) {
    console.log(boxLine(`${checkMark(check.passed)} ${check.name}`));
    if (check.message) {
      console.log(boxLine(`  → ${check.message}`));
    }
  }

  // Show warnings
  for (const w of result.warnings) {
    console.log(boxLine(`${warnMark()} ${w.message.slice(0, 49)}`));
    if (w.message.length > 49) {
      console.log(boxLine(`  → ${w.message.slice(49)}`));
    }
  }

  // Show errors
  for (const e of result.errors) {
    console.log(boxLine(`${checkMark(false)} ${e.message.slice(0, 49)}`));
  }

  console.log(boxEmpty());
  const errCount = result.errors.length;
  const warnCount = result.warnings.length;
  if (errCount === 0 && warnCount === 0) {
    console.log(boxLine("All checks passed. Ready to plan."));
  } else {
    console.log(boxLine(`${errCount} error(s), ${warnCount} warning(s).`));
    if (errCount > 0) {
      console.log(boxLine("Fix errors before proceeding."));
    }
  }
  console.log(boxBottom());

  return errCount > 0 ? 1 : 0;
}

// ── PLAN ──────────────────────────────────────────────

function plan(filePath: string): number {
  const source = readSource(filePath);
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { ast, errors: parseErrors } = new Parser(tokens).parse();
  const diagnostics = formatDiagnostics(filePath, lexErrors, parseErrors);

  if (diagnostics.length > 0) {
    printDiagnostics(diagnostics);
    console.log(`\n${diagnostics.length} error(s) — fix before planning`);
    return 1;
  }

  // Compile to get full context (needed for resolved profiles)
  let context: CompilationContext;
  try {
    const compiler = new Compiler();
    const result = compiler.compile(filePath);
    context = result.context;
  } catch (err) {
    console.error(`Plan error: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  // Semantic validation with resolved profiles
  const absPath = resolve(filePath);
  const fileExists = (path: string) => existsSync(path);
  const validationResult = semanticValidate(ast, fileExists, absPath, context.profiles);

  if (!validationResult.valid) {
    console.log("Validation failed — run `langc validate` for details.");
    return 1;
  }

  try {
    printRichPlan(context, validationResult);
    return 0;
  } catch (err) {
    console.error(`Plan error: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}

function printRichPlan(ctx: CompilationContext, validation: ValidationResult): void {
  console.log(boxTop(`Build Plan: ${ctx.projectName}`));
  console.log(boxEmpty());

  // Phases
  const { phases } = ctx.dependencyGraph;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    for (const id of phase) {
      console.log(boxLine(`Phase ${i + 1}: ${id}`));

      // Find the block
      const block = ctx.createBlocks.find(
        b => `${b.componentType}.${b.name}` === id,
      );
      if (!block) continue;

      // LNG + Framework
      const lng = block.properties.find(p => p.kind === "LngProperty");
      const fw = block.properties.find(p => p.kind === "FrameworkProperty");
      if (lng && lng.kind === "LngProperty") {
        const fwStr = fw && fw.kind === "FrameworkProperty" ? ` + ${fw.value}` : "";
        console.log(boxLine(`  → ${lng.value}${fwStr}`));
      }

      // Member counts
      const methods = block.members.filter(m => m.kind === "MethodDecl");
      const tables = block.members.filter(m => m.kind === "TableDecl");
      const displays = block.members.filter(m => m.kind === "DisplayDecl");

      if (methods.length > 0) {
        console.log(boxLine(`  → ${methods.length} endpoint(s)`));
      }
      if (tables.length > 0) {
        const totalCols = tables.reduce((sum, t) => sum + (t.kind === "TableDecl" ? t.columns.length : 0), 0);
        console.log(boxLine(`  → ${tables.length} table(s) (${totalCols} columns)`));
      }
      if (displays.length > 0) {
        console.log(boxLine(`  → ${displays.length} view(s)`));
      }

      // Gate info
      if (i < phases.length - 1) {
        console.log(boxLine(`  → Gate: wait before Phase ${i + 2}`));
      } else {
        console.log(boxLine(`  → Gate: final review`));
      }

      console.log(boxEmpty());
    }
  }

  // Profile reviews
  if (ctx.profiles.length > 0) {
    console.log(boxSep());
    console.log(boxLine("Profile Reviews:"));
    console.log(boxEmpty());

    for (const profile of ctx.profiles) {
      console.log(boxLine(`${profile.name}:`));
      for (const check of profile.onReview) {
        console.log(boxLine(`  ${checkMark(true)} ${check.slice(0, 45)}`));
      }
      console.log(boxEmpty());
    }
  }

  // Warnings from validation
  if (validation.warnings.length > 0) {
    console.log(boxSep());
    console.log(boxLine("Warnings:"));
    console.log(boxEmpty());
    for (const w of validation.warnings) {
      console.log(boxLine(`${warnMark()} ${w.message.slice(0, 49)}`));
    }
    console.log(boxEmpty());
  }

  // Gate mode
  console.log(boxSep());
  console.log(boxEmpty());
  console.log(boxLine(`Gate mode: ${ctx.gate}`));
  console.log(boxEmpty());
  console.log(boxBottom());
}

// ── COMPILE ───────────────────────────────────────────

function compile(filePath: string): number {
  try {
    const compiler = new Compiler();
    const compileResult = compiler.compile(filePath);
    const { files, context } = compileResult;
    const outputDir = context.projectName;

    writeFiles(outputDir, files);

    console.log(`Generated .claude/ artifacts:`);

    // Tree display with line counts
    for (const f of files) {
      const lineCount = f.content.split("\n").length;
      const padded = f.path.padEnd(45);
      console.log(`  ${padded} (${lineCount} lines)`);
    }

    console.log(`\n  Total: ${files.length} files generated`);
    console.log(`\n  Output: ${outputDir}/`);

    // Show incremental info
    if (compileResult.incremental) {
      printIncrementalInfo(compileResult.incremental);
    }

    return 0;
  } catch (err) {
    console.error(`Compile error: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}

function printIncrementalInfo(inc: IncrementalResult): void {
  const hasChanges = inc.changed.length > 0 || inc.added.length > 0 || inc.removed.length > 0;
  if (!hasChanges && inc.unchanged.length > 0) {
    console.log(`\n  Incremental: all ${inc.unchanged.length} component(s) unchanged`);
    return;
  }

  if (inc.added.length > 0) {
    console.log(`\n  New: ${inc.added.join(", ")}`);
  }
  if (inc.changed.length > 0) {
    console.log(`  Changed: ${inc.changed.join(", ")}`);
  }
  if (inc.unchanged.length > 0) {
    console.log(`  Unchanged: ${inc.unchanged.join(", ")}`);
  }
  if (inc.removed.length > 0) {
    console.log(`  Removed: ${inc.removed.join(", ")}`);
  }
}

// ── APPLY ─────────────────────────────────────────────

function apply(filePath: string, gateOverride: string | null): number {
  // Step 1: Validate
  const source = readSource(filePath);
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { ast, errors: parseErrors } = new Parser(tokens).parse();
  const diagnostics = formatDiagnostics(filePath, lexErrors, parseErrors);

  if (diagnostics.length > 0) {
    printDiagnostics(diagnostics);
    console.log(`\n${diagnostics.length} error(s) — fix before applying`);
    return 1;
  }

  const absPath = resolve(filePath);
  const fileExists = (path: string) => existsSync(path);
  const validationResult = semanticValidate(ast, fileExists, absPath);

  if (!validationResult.valid) {
    console.log("Validation failed — run `langc validate` for details.");
    return 1;
  }

  // Step 2: Compile
  let files: GeneratedFile[];
  let context: CompilationContext;
  let incremental: IncrementalResult | null = null;
  try {
    const compiler = new Compiler();
    const result = compiler.compile(filePath);
    files = result.files;
    context = result.context;
    incremental = result.incremental;
  } catch (err) {
    console.error(`Compile error: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  // Step 3: Write files
  const outputDir = context.projectName;
  writeFiles(outputDir, files);

  // Step 4: Show phase execution plan
  const gate = gateOverride ?? context.gate;
  const { phases } = context.dependencyGraph;

  console.log(`Applied ${filePath} → ${outputDir}/`);
  console.log(`  ${files.length} files written\n`);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    console.log(`═══ Phase ${i + 1}: ${phase.join(", ")} ═══`);

    for (const id of phase) {
      const block = context.createBlocks.find(
        b => `${b.componentType}.${b.name}` === id,
      );
      if (!block) continue;

      const skillName = `build-${block.componentType.toLowerCase()}-${block.name}`;
      console.log(`  → Skill: /skills/${skillName}`);
    }

    // Gate display
    if (gate === "auto") {
      console.log(`  → Gate: auto (proceed immediately)`);
    } else if (gate === "manual") {
      console.log(`  → Gate: manual (requires approval)`);
    } else if (gate === "confirm-on-warning") {
      console.log(`  → Gate: confirm-on-warning`);
    } else {
      // phase-by-phase (default)
      if (i < phases.length - 1) {
        console.log(`  → Gate: wait for approval before Phase ${i + 2}`);
      } else {
        console.log(`  → Gate: final review`);
      }
    }
    console.log();
  }

  // Profile review summary
  if (context.profiles.length > 0) {
    console.log("Post-build review agents:");
    for (const p of context.profiles) {
      console.log(`  - ${p.name} (${p.onReview.length} checks)`);
    }
    console.log();
  }

  console.log(`Gate mode: ${gate}`);
  console.log(`\nRun the orchestrate skill to execute: /skills/orchestrate`);

  return 0;
}

// ── MAIN ──────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    usage();
    process.exit(0);
  }

  const command = args[0];
  const file = args[1];

  // Parse flags
  let gateOverride: string | null = null;
  for (const arg of args.slice(2)) {
    if (arg.startsWith("--gate=")) {
      gateOverride = arg.slice("--gate=".length);
    }
  }

  switch (command) {
    case "validate":
      if (!file) { console.error("Error: missing file argument"); process.exit(1); }
      process.exit(validate(file));
      break;

    case "plan":
      if (!file) { console.error("Error: missing file argument"); process.exit(1); }
      process.exit(plan(file));
      break;

    case "compile":
      if (!file) { console.error("Error: missing file argument"); process.exit(1); }
      process.exit(compile(file));
      break;

    case "apply":
      if (!file) { console.error("Error: missing file argument"); process.exit(1); }
      process.exit(apply(file, gateOverride));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main();
