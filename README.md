# LangC — A DSL Transpiler for Claude Orchestration

LangC compiles structured `.langc` files into complete `.claude/` directory trees — subagent definitions, commands, rules, hooks, and orchestration plans that Claude can execute autonomously.

## Why LangC?

Instead of writing hundreds of lines of unstructured prompts, write 30 lines of LangC:

```langc
IMPORT Architect FROM "./profiles/architect.langc"
IMPORT Security FROM "./profiles/security.langc"

PROJECT "test-app" {
    CTX = "Multi-tenant SaaS platform for user management. SOC2 compliance required.",
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
        CTX = "Core identity service consumed by dashboard, mobile app, and third-party integrations.",
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
    ├── settings.json                  ← Stop hook + permissions (no PostToolUse)
    ├── agents/                        ← PROFILE → subagent definitions
    │   ├── architect.md
    │   └── security.md
    ├── commands/                      ← CREATE/UPDATE → executable commands
    │   ├── build-db-users-db.md
    │   ├── build-api-users.md
    │   ├── build-webui-users-display.md
    │   └── orchestrate.md             ← Phase 0 review + dependency-ordered build
    ├── rules/                         ← PATTERNS → path-specific rules
    │   ├── api.md
    │   ├── webui.md
    │   └── db.md
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
    CTX = "Multi-tenant B2B SaaS for invoice management. SOC2 compliance required. Stripe for payments.",
    SCOPE = full,
    GATE = phase-by-phase,
    PROFILES = [Architect, Security],

    CREATE DB "main-db" {
        CTX = "Shared database across all tenants. Row-level security via tenant_id column.",
        LNG = postgresql,
        DEPENDS = none,
        TABLE "tenants" {
            id: uuid -> "primary key",
            name: string -> "company name, required",
            plan: string -> "free | pro | enterprise",
            stripe_customer_id: string -> "nullable, set after Stripe onboarding"
        },
        TABLE "invoices" {
            id: uuid -> "primary key",
            tenant_id: uuid -> "foreign key to tenants, used for row-level security",
            amount_cents: int -> "stored in cents to avoid floating point",
            status: string -> "draft | sent | paid | overdue",
            due_date: date -> "required"
        }
    },

    CREATE API "billing" {
        CTX = "Billing service consumed by the dashboard and Stripe webhooks. Must handle idempotent webhook retries.",
        LNG = python,
        FRAMEWORK = fastapi,
        DEPENDS = [DB.main-db],
        METHOD GET    "/invoices"            -> "list invoices for current tenant with pagination and status filter",
        METHOD POST   "/invoices"            -> "create a draft invoice",
        METHOD GET    "/invoices/{id}"       -> "get invoice by id, scoped to tenant",
        METHOD PUT    "/invoices/{id}"       -> "update draft invoice amount or due date",
        METHOD POST   "/invoices/{id}/send"  -> "mark invoice as sent, trigger email notification",
        PUBLIC METHOD POST "/webhooks/stripe" -> "handle Stripe payment webhooks, idempotent"
    },

    CREATE WEBUI "dashboard" {
        CTX = "Internal dashboard for finance teams. Must support bulk operations on invoices.",
        LNG = React,
        FRAMEWORK = nextjs,
        DEPENDS = [API.billing],
        DISPLAY API.billing.GET("/invoices")      -> "Table with filters by status, sortable by due date",
        DISPLAY API.billing.POST("/invoices")     -> "Form to create new invoice with amount and due date",
        DISPLAY API.billing.GET("/invoices/{id}") -> "Invoice detail page with payment history"
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
  CLAUDE.md                                        (52 lines)
  .langc/state.json                                (68 lines)
  .claude/settings.json                            (28 lines)
  .claude/agents/architect.md                      (22 lines)
  .claude/agents/security.md                       (20 lines)
  .claude/commands/build-db-main-db.md              (40 lines)
  .claude/commands/build-api-billing.md             (48 lines)
  .claude/commands/build-webui-dashboard.md         (42 lines)
  .claude/commands/orchestrate.md                   (35 lines)
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
  → Command: /build-db-main-db
  → Gate: wait for approval before Phase 2

═══ Phase 2: API.billing ═══
  → Command: /build-api-billing
  → Gate: wait for approval before Phase 3

═══ Phase 3: WEBUI.dashboard ═══
  → Command: /build-webui-dashboard
  → Gate: final review

Gate mode: phase-by-phase
```

### Step 6: Let Claude build it

Copy the generated `my-app/` directory into your project. The `.claude/` directory contains everything Claude needs:

1. **`CLAUDE.md`** — Project context, global rules, build order
2. **`commands/orchestrate.md`** — Run `/orchestrate` to start with Phase 0 architecture review, then phased build
3. **`agents/`** — Profile subagents consulted during Phase 0 and available for on-demand guidance
4. **`rules/`** — Path-specific coding rules per component type
5. **`settings.json`** — End-of-session Stop hook review + permissions (no per-write hooks)

Claude will build each component in dependency order, with the gate mode controlling when human approval is required.

### Iterative development with UPDATE

After the initial build, modify your `.langc` file to add new endpoints:

```langc
UPDATE API.billing {
    ADD METHOD DELETE "/invoices/{id}" -> "void a draft invoice",
    ADD METHOD GET    "/invoices/overdue" -> "list overdue invoices for dunning"
}
```

Re-run `langc compile` — incremental compilation detects only what changed:

```
  Changed: API.billing
  Unchanged: DB.main-db, WEBUI.dashboard
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

## Business Context with CTX

Add business context to your project and individual components. CTX strings flow into every generated file, giving Claude the *why* behind the structure:

```langc
PROJECT "my-app" {
    CTX = "Multi-tenant SaaS platform. SOC2 compliance required.",
    SCOPE = full,

    CREATE API "users" {
        CTX = "Core identity service consumed by dashboard, mobile, and third-party integrations.",
        LNG = python,
        FRAMEWORK = fastapi,
        METHOD GET "/users" -> "list all users"
    }
}
```

**Context cascade**: Block-level CTX supplements project CTX — it doesn't replace it. Generated skill files show both when both exist.

| Level | Where it appears |
|-------|-----------------|
| Project CTX | `CLAUDE.md`, orchestrate command, plan command |
| Block CTX | Component command files (alongside project CTX) |

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
| `ON_REVIEW` | End-of-session review checklist | Stop hook in `settings.json` + smart warnings in `validate` |

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

## Why Commands, Not Skills?

LangC originally generated Claude Code **skills** (`.claude/skills/*/SKILL.md`). The orchestrator would emit `Execute: /build-api-users`, but Claude had no mechanism to dispatch one skill from another — the line was just inert text.

Claude Code **commands** (`.claude/commands/*.md`) solve this: they're plain markdown files that Claude can invoke natively via `/command-name`. Converting build skills to commands means:

- `/orchestrate` can call `/build-db-users-db`, which actually runs
- No YAML frontmatter needed — commands are plain markdown instructions
- Each command includes an **Output Structure** section with concrete directory hints based on LNG/FRAMEWORK
- Each command ends with a **Done** checklist so Claude knows when to stop

This is the single change that makes the generated orchestration plan actually executable end-to-end.

## Development

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Lexer + Parser + AST + CLI (`validate`, `plan`) |
| Phase 2 | ✅ Complete | Code generation — all generators, 19 output files, 121 tests |
| Phase 3 | ✅ Complete | Human-in-the-loop — semantic validation, rich plan, compile with line counts, apply with phase gates (139 tests) |
| Phase 4 | ✅ Complete | REFERENCE scanning, permissions, checksums, incremental compilation (165 tests) |
| Phase 5 | ✅ Complete | Drift detection, resume from partial, deep profile conflicts, smart ON_REVIEW, REFERENCE overrides (187 tests) |
| Phase 6 | ✅ Complete | Hierarchical CTX property — business context at project and block level, flows into all generated files (197 tests) |
| Phase 7 | ✅ Complete | Skills → Commands — convert skills to `.claude/commands/` for native Claude Code invocation, output structure hints, done checklists (200 tests) |
| Phase 8 | ✅ Complete | Architect as Phase 0 consultant — remove PostToolUse hooks, add Phase 0 architecture review, agent consultation hints in build commands (206 tests) |

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
| `CTX = "description"` | Business context (project or block level) |
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
