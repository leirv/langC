# LangC — A DSL Transpiler for Claude Orchestration

LangC compiles structured `.langc` files into complete `.claude/` directory trees — subagent definitions, skills, rules, hooks, and orchestration plans that Claude can execute autonomously.

## Why LangC?

Instead of writing hundreds of lines of unstructured prompts, write 30 lines of LangC:

```langc
IMPORT Architect FROM "./profiles/architect.langc"
IMPORT Security FROM "./profiles/security.langc"

PROJECT "test-app" {
    SCOPE = full,
    REFERENCE = none,
    PROFILES = [Architect, Security],

    CREATE DB "users-db" {
        LNG = postgresql,
        DEPENDS = none,
        TABLE "users" {
            id: int -> "primary key, auto increment",
            name: string -> "required, max 100 chars",
            email: string -> "required, unique",
            created_at: datetime -> "auto-set on creation"
        }
    },

    CREATE API "users" {
        LNG = python,
        FRAMEWORK = fastapi,
        DEPENDS = [DB.users-db],
        METHOD GET    "/users"      -> "list all users with pagination",
        METHOD POST   "/users"      -> "create a user with name, email",
        METHOD GET    "/users/{id}" -> "get user by id",
        METHOD PUT    "/users/{id}" -> "update user name or email",
        METHOD DELETE "/users/{id}" -> "delete user by id"
    },

    CREATE WEBUI "users-display" {
        LNG = React,
        FRAMEWORK = nextjs,
        DEPENDS = [API.users],
        DISPLAY API.users.GET("/users")      -> "Table with all users, paginated",
        DISPLAY API.users.POST("/users")     -> "Form to create a new user",
        DISPLAY API.users.GET("/users/{id}") -> "Search bar to find user by id"
    }
}
```

The transpiler produces a fully configured `.claude/` directory:

```
test-app/
├── CLAUDE.md                          ← Project context, rules, build order
├── .langc/state.json                  ← Build state tracking
└── .claude/
    ├── settings.json                  ← Review hooks + permissions
    ├── agents/                        ← PROFILE → subagent definitions
    │   ├── architect.md
    │   └── security.md
    ├── skills/                        ← CREATE/UPDATE → executable skills
    │   ├── build-db-users-db/SKILL.md
    │   ├── build-api-users/SKILL.md
    │   ├── build-webui-users-display/SKILL.md
    │   └── orchestrate/SKILL.md       ← Dependency-ordered build plan
    ├── rules/                         ← PATTERNS → path-specific rules
    │   ├── api.md
    │   ├── webui.md
    │   └── db.md
    ├── hooks/                         ← ON_REVIEW → automated guardrails
    │   ├── review-architect.sh
    │   └── review-security.sh
    └── agent-memory/langc/MEMORY.md   ← Build summary for Claude
```

## Installation

```bash
npm install
npm run build
```

## CLI Commands

```bash
# Semantic validation (syntax + DEPENDS + cycles + imports + conflicts)
langc validate examples/test-app.langc

# Rich build plan with phases, profile reviews, and gate mode
langc plan examples/test-app.langc

# Compile to .claude/ artifacts with line counts
langc compile examples/test-app.langc

# Compile + write + show phase execution plan with gates
langc apply examples/test-app.langc
langc apply examples/test-app.langc --gate=manual
```

## Architecture

```
.langc source → Lexer → Parser → AST → Code Generators → .claude/ directory
```

### Source Layout

```
src/
├── index.ts              ← CLI entry point
├── ast/nodes.ts          ← AST type definitions
├── lexer/
│   ├── lexer.ts          ← Tokenizer
│   ├── tokens.ts         ← Token types
│   └── keywords.ts       ← Keyword table
├── parser/
│   ├── parser.ts         ← Recursive descent parser
│   └── errors.ts         ← Parse error collector
├── errors/
│   └── diagnostics.ts    ← Error formatting
├── cli/
│   └── format.ts         ← Box-style CLI formatting utilities
└── codegen/              ← Phase 2: Code generation + Phase 3: Validation
    ├── types.ts          ← GeneratedFile, CompilationContext
    ├── generator.ts      ← Generator interface
    ├── import-resolver.ts ← Parse FROM files, flatten EXTENDS
    ├── dependency-graph.ts ← DAG, topological sort, cycle detection
    ├── compiler.ts       ← Pipeline orchestrator
    ├── validator.ts      ← Semantic validation (DEPENDS, cycles, imports)
    ├── writer.ts         ← Filesystem writer (only fs-touching module)
    ├── builtin-profiles.ts ← Architect, Security, QA, DevOps
    └── generators/       ← One generator per artifact type
        ├── claude-md.ts
        ├── create-skill.ts
        ├── update-skill.ts
        ├── agent.ts
        ├── rules.ts
        ├── lng-rules.ts
        ├── hooks.ts
        ├── orchestrate.ts
        ├── state.ts
        └── plan-skill.ts
```

## Design Principles

1. **Verbs + Nouns + Context** — `CREATE API "users" { METHOD GET "/users" -> "..." }`
2. **10x more concise** than equivalent natural language prompts
3. **Deterministic** — same input always produces the same output
4. **Iterative** — `UPDATE API.users { ADD METHOD ... }` modifies existing components
5. **Generators never touch filesystem** — return `GeneratedFile[]`, testable by array assertions
6. **Pipeline is additive** — each phase appends generators, never modifies existing ones

## Development

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Lexer + Parser + AST + CLI (`validate`, `plan`) |
| Phase 2 | ✅ Complete | Code generation — all generators, 19 output files, 121 tests |
| Phase 3 | ✅ Complete | Human-in-the-loop — semantic validation, rich plan, compile with line counts, apply with phase gates (139 tests) |

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

### Development Mode

```bash
npm run langc -- validate examples/test-app.langc
npm run langc -- plan examples/test-app.langc
npm run langc -- compile examples/test-app.langc
npm run langc -- apply examples/test-app.langc --gate=manual
```

## Language Reference

| Construct | Purpose |
|-----------|---------|
| `IMPORT Name FROM "path"` | Import a profile from another file |
| `PROJECT "name" { ... }` | Define a project with components |
| `SCOPE = full\|skeleton\|prototype` | Build scope (how complete) |
| `GATE = phase-by-phase\|manual\|auto` | Human approval gate mode |
| `REFERENCE = "./path"\|none` | Existing codebase to match |
| `PROFILES = [A, B]` | Expert profiles governing generation |
| `CREATE DB\|API\|WEBUI\|FNC "name"` | Create a component |
| `UPDATE TYPE.name { ... }` | Modify an existing component |
| `LNG = python` | Language constraint |
| `FRAMEWORK = fastapi` | Framework constraint |
| `DEPENDS = [TYPE.name]` | Dependency declaration |
| `METHOD GET "/path" -> "desc"` | API endpoint |
| `PUBLIC METHOD ...` | Unauthenticated endpoint |
| `DISPLAY API.ref -> "desc"` | UI view linked to API |
| `TABLE "name" { col: type }` | Database table schema |
| `PROFILE Name { ROLE, RULES, PATTERNS, ON_REVIEW }` | Expert profile definition |

## License

MIT
