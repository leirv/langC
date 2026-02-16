# LangC Development Guide

## Quick Start
```bash
npm test          # Run all tests (vitest)
npm run build     # TypeScript compile
npm run dev -- compile examples/test-app.langc  # Compile example
```

## Architecture
- **Pure ESM** — Node16 module resolution, `.js` extensions in all imports
- **TypeScript strict mode**, ES2022 target
- **Vitest** for testing, **tsx** for dev, zero runtime dependencies
- Generators return `GeneratedFile[]` — never touch the filesystem directly
- Only `src/codegen/writer.ts` performs filesystem operations

## Key Directories
- `src/ast/` — AST node types (`nodes.ts`)
- `src/codegen/` — Compiler pipeline (types, generator, compiler, writer)
- `src/codegen/generators/` — Individual generators (claude-md, create-skill, orchestrate, hooks, agent, rules, etc.)
- `tests/` — Mirrors `src/` structure
- `examples/` — `.langc` example files

## Conventions
- Test helpers use `loc = { line: 1, column: 1 }` and `makeCtx()` factory functions
- `CompilationContext` is the shared context object passed to all generators
- Built-in profiles: Architect, Security, QA, DevOps (no FROM path needed)
- Commands (`.claude/commands/`) replace skills for native Claude Code invocation
