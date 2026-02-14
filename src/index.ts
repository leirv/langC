import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { formatDiagnostics, printDiagnostics } from "./errors/diagnostics.js";

function usage(): void {
  console.log(`Usage: langc <command> <file>

Commands:
  validate <file>   Parse a .langc file and report errors
  plan <file>       Parse and print AST summary
  compile <file>    Compile to .claude/ artifacts (Phase 2)
  apply <file>      Compile and apply (Phase 2)`);
}

function readSource(filePath: string): string {
  const abs = resolve(filePath);
  return readFileSync(abs, "utf-8");
}

function validate(filePath: string): number {
  const source = readSource(filePath);
  const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
  const { errors: parseErrors } = new Parser(tokens).parse();
  const diagnostics = formatDiagnostics(filePath, lexErrors, parseErrors);

  if (diagnostics.length === 0) {
    console.log(`${filePath}: 0 errors`);
    return 0;
  }

  printDiagnostics(diagnostics);
  console.log(`\n${diagnostics.length} error(s)`);
  return 1;
}

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

  // Print AST summary
  console.log(`LangC Plan — parsed ${filePath}\n`);
  console.log(`Imports: ${ast.imports.length}`);
  for (const imp of ast.imports) {
    const from = imp.from ? ` from "${imp.from}"` : " (built-in)";
    const ver = imp.version ? `@${imp.version}` : "";
    console.log(`  - ${imp.name}${ver}${from}`);
  }

  for (const decl of ast.declarations) {
    if (decl.kind === "ProjectDecl") {
      console.log(`\nProject: "${decl.name}"`);
      for (const prop of decl.properties) {
        if (prop.kind === "ScopeProperty") console.log(`  Scope: ${prop.value}`);
        if (prop.kind === "ReferenceProperty") console.log(`  Reference: ${prop.value}`);
        if (prop.kind === "ProfilesProperty") console.log(`  Profiles: [${prop.names.map(n => n.name).join(", ")}]`);
      }
      for (const block of decl.blocks) {
        if (block.kind === "CreateBlock") {
          console.log(`  CREATE ${block.componentType} "${block.name}" (${block.members.length} members)`);
        } else if (block.kind === "UpdateBlock") {
          console.log(`  UPDATE ${block.target.parts.join(".")} (${block.members.length} changes)`);
        }
      }
    } else if (decl.kind === "ProfileDecl") {
      console.log(`\nProfile: ${decl.name}`);
      if (decl.role) console.log(`  Role: ${decl.role}`);
      console.log(`  Rules: ${decl.rules.length}`);
      console.log(`  Patterns: ${decl.patterns.length}`);
      console.log(`  OnReview: ${decl.onReview.length}`);
    }
  }

  return 0;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    usage();
    process.exit(0);
  }

  const command = args[0];
  const file = args[1];

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
    case "apply":
      console.log(`'${command}' requires Phase 2 (code generation) — not yet implemented.`);
      console.log("Phase 1 provides: validate, plan");
      process.exit(0);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main();
