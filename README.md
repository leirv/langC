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

## Getting Started

### Step 1: Write a `.langc` file

Create a file called `my-app.langc`:

```langc
IMPORT Architect
IMPORT Security

PROJECT "my-app" {
    SCOPE = full,
    PROFILES = [Architect, Security],

    CREATE DB "main-db" {
        LNG = postgresql,
        DEPENDS = none,
        TABLE "users" {
            id: int -> "primary key, auto increment",
            email: string -> "required, unique",
            name: string -> "required, max 100 chars"
        }
    },

    CREATE API "backend" {
        LNG = python,
        FRAMEWORK = fastapi,
        DEPENDS = [DB.main-db],
        METHOD GET  "/users"      -> "list all users with pagination",
        METHOD POST "/users"      -> "create a user with email and name",
        METHOD GET  "/users/{id}" -> "get user by id"
    },

    CREATE WEBUI "frontend" {
        LNG = React,
        FRAMEWORK = nextjs,
        DEPENDS = [API.backend],
        DISPLAY API.backend.GET("/users")     -> "Table showing all users",
        DISPLAY API.backend.POST("/users")    -> "Form to create a new user"
    }
}
```

### Step 2: Validate

Check for syntax errors, broken dependencies, circular references, and profile conflicts:

```bash
langc validate my-app.langc
```

Output:

```
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║  ✅ Syntax valid                                      ║
║  ✅ All DEPENDS references resolve                    ║
║  ✅ No circular dependencies                          ║
║  ✅ All IMPORT profiles found                         ║
║  ✅ No profile conflicts                              ║
║  ✅ ON_REVIEW evaluation                              ║
║                                                       ║
║  All checks passed. Ready to plan.                    ║
╚═══════════════════════════════════════════════════════╝
```

### Step 3: Plan

See the full build plan with dependency phases, profile reviews, and gate strategy:

```bash
langc plan my-app.langc
```

This shows which components build in which order (DB first, then API, then WEBUI), what each profile will check during review, and the gate mode controlling human approval.

### Step 4: Compile

Generate the complete `.claude/` directory tree:

```bash
langc compile my-app.langc
```

Output:

```
Generated .claude/ artifacts:
  CLAUDE.md                                        (45 lines)
  .langc/state.json                                (62 lines)
  .claude/settings.json                            (28 lines)
  .claude/agents/architect.md                      (22 lines)
  .claude/agents/security.md                       (20 lines)
  .claude/skills/build-db-main-db/SKILL.md         (35 lines)
  .claude/skills/build-api-backend/SKILL.md        (42 lines)
  .claude/skills/build-webui-frontend/SKILL.md     (38 lines)
  .claude/skills/orchestrate/SKILL.md              (30 lines)
  .claude/rules/api.md                             (12 lines)
  .claude/rules/webui.md                           (10 lines)
  .claude/rules/db.md                              (8 lines)
  ...

  Total: 19 files generated
  Output: my-app/
```

### Step 5: Apply (compile + execute plan)

Compile and display the phase execution plan with gates:

```bash
langc apply my-app.langc
```

This writes all files and shows the phased build order:

```
Applied my-app.langc → my-app/
  19 files written

═══ Phase 1: DB.main-db ═══
  → Skill: /skills/build-db-main-db
  → Gate: wait for approval before Phase 2

═══ Phase 2: API.backend ═══
  → Skill: /skills/build-api-backend
  → Gate: wait for approval before Phase 3

═══ Phase 3: WEBUI.frontend ═══
  → Skill: /skills/build-webui-frontend
  → Gate: final review

Gate mode: phase-by-phase
```

### Step 6: Let Claude build it

Copy the generated `my-app/` directory into your project. The `.claude/` directory contains everything Claude needs:

1. **`CLAUDE.md`** — Project context, global rules, build order
2. **`skills/orchestrate/SKILL.md`** — Run `/skills/orchestrate` to start the phased build
3. **`agents/`** — Profile subagents that review generated code
4. **`rules/`** — Path-specific coding rules per component type
5. **`hooks/`** — Automated review guardrails that run on each skill completion

Claude will build each component in dependency order, with the gate mode controlling when human approval is required.

### Iterative development with UPDATE

After the initial build, modify your `.langc` file to add new endpoints:

```langc
UPDATE API.backend {
    ADD METHOD PUT    "/users/{id}" -> "update user name or email",
    ADD METHOD DELETE "/users/{id}" -> "delete user by id"
}
```

Re-run `langc compile` — incremental compilation detects only what changed:

```
  Changed: API.backend
  Unchanged: DB.main-db, WEBUI.frontend
```

## Gate Modes

Control how Claude pauses for human approval between build phases:

| Mode | Behavior |
|------|----------|
| `phase-by-phase` (default) | Pause after each dependency phase for approval |
| `manual` | Pause after every single component for explicit approval |
| `auto` | Run all phases without pausing (fully autonomous) |
| `confirm-on-warning` | Auto-proceed unless validation warnings exist |

Set in your `.langc` file:

```langc
PROJECT "my-app" {
    GATE = manual,
    ...
}
```

Or override at apply time:

```bash
langc apply my-app.langc --gate=auto
```

## Profiles

Profiles are expert agents that govern how code is generated and reviewed.

### Built-in profiles

Use without a `FROM` path:

| Profile | Role | What it enforces |
|---------|------|------------------|
| `Architect` | Senior Software Architect | Clean architecture, thin controllers, dependency injection, composition over inheritance |
| `Security` | Application Security Engineer | Auth on all endpoints, input validation, parameterized queries, rate limiting, CORS |
| `QA` | Quality Assurance Engineer | Unit + integration tests, fixtures, 80% coverage target |
| `DevOps` | DevOps / Infrastructure Engineer | Dockerfiles, env vars, health checks, structured logging |

```langc
IMPORT Architect
IMPORT Security
```

### Custom profiles

Create a `.langc` file with a `PROFILE` declaration:

```langc
// profiles/my-team.langc
PROFILE MyTeam {
    ROLE = "Team Lead",

    RULES {
        "Use TypeScript strict mode everywhere",
        "All functions must have JSDoc comments",
        "No default exports"
    },

    PATTERNS {
        API -> "src/ tests/ docs/",
        WEBUI -> "src/components/ src/pages/ src/hooks/"
    },

    ON_REVIEW {
        "Warn if a CREATE block has more than 5 methods — suggest splitting",
        "Flag any endpoint without auth middleware"
    }
}
```

Import it with a `FROM` path:

```langc
IMPORT MyTeam FROM "./profiles/my-team.langc"

PROJECT "my-app" {
    PROFILES = [MyTeam],
    ...
}
```

### What each section does

| Section | Purpose | Generated as |
|---------|---------|-------------|
| `ROLE` | Describes the agent's expertise | Agent identity in `.claude/agents/<name>.md` |
| `RULES` | Coding rules injected into every skill | Global rules in `CLAUDE.md` + skill instructions |
| `PATTERNS` | Directory structure per component type | `.claude/rules/<component>.md` |
| `ON_REVIEW` | Automated checks run during validation | `.claude/hooks/review-<name>.sh` + smart warnings in `validate` |

## Matching an existing codebase with REFERENCE

Point `REFERENCE` at your existing project to have the transpiler detect its stack and conventions:

```langc
PROJECT "my-app" {
    REFERENCE = "../existing-project",
    ...
}
```

The compiler scans the reference directory and injects detected patterns into `CLAUDE.md`:
- **Languages** detected from file extensions
- **Frameworks** from config files (next.config.js, pyproject.toml, etc.)
- **Conventions** from directory structure (MVC, service layers, etc.)

If your `.langc` file declares a different LNG or FRAMEWORK than what the reference uses, validation will warn you about the mismatch.

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
└── codegen/
    ├── types.ts          ← GeneratedFile, CompilationContext
    ├── generator.ts      ← Generator interface
    ├── import-resolver.ts ← Parse FROM files, flatten EXTENDS
    ├── dependency-graph.ts ← DAG, topological sort, cycle detection
    ├── compiler.ts       ← Pipeline orchestrator
    ├── validator.ts      ← Semantic validation (DEPENDS, cycles, imports, conflicts, ON_REVIEW)
    ├── checksum.ts       ← SHA-256 checksums for state tracking
    ├── incremental.ts    ← Incremental compilation + resume detection
    ├── drift.ts          ← Drift detection (external file modifications)
    ├── reference-scanner.ts ← REFERENCE codebase scanning + detection
    ├── writer.ts         ← Filesystem writer (only fs-touching module)
    ├── builtin-profiles.ts ← Architect, Security, QA, DevOps
    └── generators/       ← One generator per artifact type
        ├── claude-md.ts  ← (includes REFERENCE scan injection)
        ├── create-skill.ts
        ├── update-skill.ts
        ├── agent.ts
        ├── rules.ts
        ├── lng-rules.ts
        ├── hooks.ts      ← (includes permissions.allow/deny)
        ├── orchestrate.ts
        ├── state.ts      ← (includes checksums, paths, methods, drift checksums)
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
| Phase 4 | ✅ Complete | REFERENCE scanning, permissions, checksums, incremental compilation (165 tests) |
| Phase 5 | ✅ Complete | Drift detection, resume from partial, deep profile conflicts, smart ON_REVIEW, REFERENCE overrides (187 tests) |

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
