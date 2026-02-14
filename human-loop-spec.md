# LangC Human-in-the-Loop Specification

## The Problem

The current design has two extremes:
- **Full control**: Human writes every line of DSL
- **Full automation**: Claude executes everything after transpilation

Neither is right. We need **defined checkpoints** where the human reviews, approves,
rejects, or redirects — without micromanaging every step.

## Design Principle

> The human controls the **what** and the **when**.
> Claude controls the **how**.
> The transpiler controls the **order**.
> Checkpoints exist at every **boundary of trust**.

## The Full Pipeline With Checkpoints

```
 ┌─────────────┐
 │ Human writes │
 │  .langc file │
 │              │
 └──────┬───────┘
        │
        ▼
 ┌─────────────────┐
 │  langc validate  │  ← CHECKPOINT 1: Is the DSL valid?
 │                  │    Syntax errors, missing DEPENDS, profile conflicts
 └──────┬───────────┘
        │ ✓ valid
        ▼
 ┌─────────────────┐
 │   langc plan     │  ← CHECKPOINT 2: What will be generated?
 │                  │    Show .claude/ file tree + skill summaries
 │  ON_REVIEW runs  │    Show profile warnings/flags
 │                  │    Human: [approve / edit / reject]
 └──────┬───────────┘
        │ ✓ approved
        ▼
 ┌─────────────────┐
 │  langc compile   │  ← CHECKPOINT 3: Review generated artifacts?
 │                  │    Generates .claude/ folder
 │                  │    Human: [apply / inspect / edit / reject]
 └──────┬───────────┘
        │ ✓ apply
        ▼
 ┌──────────────────────────────────────────────┐
 │              langc apply                      │
 │                                               │
 │  ┌──────────┐    ┌──────────┐    ┌─────────┐ │
 │  │ Phase 1  │───▶│ Phase 2  │───▶│ Phase 3 │ │
 │  │ DB       │    │ API      │    │ WEBUI   │ │
 │  └────┬─────┘    └────┬─────┘    └────┬────┘ │
 │       │               │               │      │
 │    GATE 1 ←────── GATE 2 ←─────── GATE 3     │
 │                                               │
 └───────────────────────┬───────────────────────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  Post-build   │  ← CHECKPOINT 4: Final review
                 │  Review       │    Profile agents audit the output
                 │               │    Human: [accept / fix / rollback]
                 └───────────────┘
```

## Checkpoint 1: Validate

**When**: Immediately after the human writes/modifies a `.langc` file.
**Purpose**: Catch errors before any generation happens.
**Human power**: Fix and re-validate.

```
$ langc validate test-app.langc

╔═══════════════════════════════════════════════╗
║  Validation: test-app.langc                   ║
╠═══════════════════════════════════════════════╣
║                                               ║
║  ✓ Syntax valid                               ║
║  ✓ All DEPENDS references resolve             ║
║  ✓ No circular dependencies                   ║
║  ✓ All IMPORT profiles found                  ║
║  ⚠ FRAMEWORK = auto on API.users              ║
║    → No REFERENCE set. Cannot infer.          ║
║    → Defaulting to FastAPI (python profile)   ║
║  ✗ PROFILE conflict:                          ║
║    → Architect says "split into layers"       ║
║    → CompanyLegacy says "single file MVC"     ║
║    → RESOLVE: which takes priority?           ║
║                                               ║
║  1 error, 1 warning. Fix before proceeding.   ║
╚═══════════════════════════════════════════════╝
```

**What the human does here**:
- Fix syntax errors
- Resolve profile conflicts (choose which wins, or add EXCEPT)
- Acknowledge warnings or override defaults

**This maps to**: Pure transpiler logic. No Claude involvement yet.

## Checkpoint 2: Plan

**When**: After validation passes, before generating `.claude/` artifacts.
**Purpose**: Show the human exactly what will be built and in what order.
**Human power**: Approve, edit the plan, or reject entirely.

```
$ langc plan test-app.langc

╔═══════════════════════════════════════════════════════╗
║  Build Plan: test-app                                 ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Phase 1: DB.users-db                                 ║
║    → PostgreSQL table "users" (4 columns)             ║
║    → Generate: migration script + seed data           ║
║    → Gate: wait for human approval before Phase 2     ║
║                                                       ║
║  Phase 2: API.users                                   ║
║    → Python + FastAPI, 5 endpoints                    ║
║    → Generate: router, services, repos, models, tests ║
║    → Gate: wait for human approval before Phase 3     ║
║                                                       ║
║  Phase 3: WEBUI.users-display                         ║
║    → React + Next.js, 5 views                         ║
║    → Generate: pages, components, hooks, API client   ║
║    → Gate: final review                               ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║  Profile Reviews:                                     ║
║                                                       ║
║  Architect:                                           ║
║    ✓ Layer separation planned for all components      ║
║    ✓ Dependency direction is correct                  ║
║                                                       ║
║  Security:                                            ║
║    ✓ Auth middleware planned for all endpoints         ║
║    ⚠ No rate limiting specified — add to API.users?   ║
║                                                       ║
║  QA:                                                  ║
║    ✓ Test generation planned for all components       ║
║    ⚠ No E2E tests planned for WEBUI — add?           ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  [approve]  [edit]  [reject]                          ║
║                                                       ║
║  Gate mode: [phase-by-phase]  [auto]  [manual]        ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

### Gate Modes — This Is Key

The human chooses **how much control they want during execution**:

| Gate Mode | Behavior | Best For |
|-----------|----------|----------|
| `manual` | Stop after EVERY phase. Human must approve each. | Critical/production projects |
| `phase-by-phase` | Stop between dependency phases. Auto-proceed within parallel tasks. | Default — balanced control |
| `auto` | Run everything. Only stop on errors or profile violations. | Prototypes, trusted workflows |
| `confirm-on-warning` | Run automatically but stop when ON_REVIEW raises a ⚠ | Experienced users |

```langc
// User can set gate mode in the .langc file itself
PROJECT "test-app" {
    GATE = phase-by-phase,    // or: manual, auto, confirm-on-warning
    ...
}
```

**This maps to**: The `plan` skill in `.claude/skills/plan/SKILL.md`.
Profile agents (subagents) run their ON_REVIEW checks here.

## Checkpoint 3: Compile (Inspect Generated Artifacts)

**When**: After plan is approved, the transpiler generates the `.claude/` folder.
**Purpose**: Let the human inspect the actual generated artifacts before Claude touches any code.
**Human power**: Apply as-is, inspect/edit individual files, or reject.

```
$ langc compile test-app.langc

Generated .claude/ artifacts:
  ├── CLAUDE.md                              (312 lines)
  ├── .claude/settings.json                  (45 lines)
  ├── .claude/agents/architect.md            (38 lines)
  ├── .claude/agents/security.md             (41 lines)
  ├── .claude/agents/qa.md                   (35 lines)
  ├── .claude/skills/build-db-users-db/      (1 file)
  ├── .claude/skills/build-api-users/        (1 file)
  ├── .claude/skills/build-webui-display/    (1 file)
  ├── .claude/skills/orchestrate/            (1 file)
  ├── .claude/rules/                         (4 files)
  └── .claude/hooks/                         (1 file)

  Total: 14 files generated

  [apply]  [inspect <file>]  [edit <file>]  [reject]
```

**Why this checkpoint matters**:
The human can read exactly what Claude will receive as instructions.
No black box. If a skill's instructions are wrong, fix them before execution.

**This maps to**: File system output. No Claude involvement yet.
This is the last moment before Claude starts generating application code.

## Phase Gates (During Apply)

**When**: Between dependency phases during `langc apply`.
**Purpose**: Verify each component before the next one builds on top of it.
**Human power**: Continue, fix issues, re-run phase, or abort.

```
$ langc apply test-app.langc --gate=phase-by-phase

═══ Phase 1: DB.users-db ═══
→ Executing /build-db-users-db...
→ Created: migrations/001_create_users.sql
→ Created: db/seed.sql
→ Migration test: ✓ passed

╔═══════════════════════════════════════╗
║  Phase 1 complete.                    ║
║                                       ║
║  Files created: 2                     ║
║  Tests passed: 1/1                    ║
║                                       ║
║  Review the output before Phase 2?    ║
║                                       ║
║  [continue]  [inspect]  [fix]  [abort]║
╚═══════════════════════════════════════╝

> continue

═══ Phase 2: API.users ═══
→ Executing /build-api-users...
→ Created: api/router/users.py
→ Created: api/services/user_service.py
→ Created: api/repositories/user_repository.py
→ Created: api/models/user.py
→ Created: api/schemas/user_request.py
→ Created: api/schemas/user_response.py
→ Created: api/main.py
→ Created: tests/unit/test_user_service.py
→ Created: tests/integration/test_users_api.py
→ Running tests: pytest tests/
→ Tests: 12/12 passed ✓
→ Security hook: ✓ no violations
→ Architect review: ✓ layers correct

╔═══════════════════════════════════════╗
║  Phase 2 complete.                    ║
║                                       ║
║  Files created: 9                     ║
║  Tests passed: 12/12                  ║
║  Profile checks: all ✓               ║
║                                       ║
║  [continue]  [inspect]  [fix]  [abort]║
╚═══════════════════════════════════════╝
```

**What "fix" does**:
The human can:
1. Manually edit a generated file
2. Tell Claude what to change (natural language)
3. The transpiler re-runs the phase with modifications
4. Tests re-run to verify

**What "abort" does**:
1. Stops execution
2. State file records partial build (Phase 1 complete, Phase 2 complete, Phase 3 not started)
3. Next `langc apply` resumes from where it stopped

**This maps to**: The orchestration skill's execution flow.
Gates are implemented as human confirmation prompts between skill invocations.

## Checkpoint 4: Post-Build Review

**When**: After all phases complete.
**Purpose**: Final quality gate before the human accepts the output.
**Human power**: Accept, request changes, or rollback.

```
$ langc apply test-app.langc
...
═══ All phases complete ═══

Running post-build review...

╔═══════════════════════════════════════════════════╗
║  Post-Build Review: test-app                      ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  Architect Review:                                ║
║    ✓ All components follow layered architecture   ║
║    ✓ No circular dependencies                     ║
║    ✓ Clean separation of concerns                 ║
║                                                   ║
║  Security Review:                                 ║
║    ✓ All endpoints have auth middleware            ║
║    ✓ Input validation on all POST/PUT              ║
║    ✓ Parameterized queries throughout             ║
║    ⚠ CORS not configured — add before production  ║
║                                                   ║
║  QA Review:                                       ║
║    ✓ 34/34 tests passing                          ║
║    ✓ Coverage: 87% (target: 80%)                  ║
║    ⚠ No E2E tests — consider adding               ║
║                                                   ║
║  Summary:                                         ║
║    Files created: 24                              ║
║    Tests: 34 passing                              ║
║    Warnings: 2                                    ║
║    Violations: 0                                  ║
║                                                   ║
║  [accept]  [fix warnings]  [rollback]             ║
╚═══════════════════════════════════════════════════╝
```

**This maps to**: Profile subagents running as reviewers after the
orchestration skill completes. The Stop hook triggers the final audit.

## Conflict & Drift Detection (UPDATE Operations)

When the human runs UPDATE on a project that may have been manually modified:

```
$ langc apply update-users.langc

⚠ Drift detected on API.users:

  State file says:                    Actual files:
  ─────────────────                   ──────────────
  5 endpoints                         7 endpoints (2 added manually)
  checksum: a1b2c3d4                  checksum: x9y8z7w6

  The codebase has changed since last langc apply.
  Manual changes detected in:
    - api/router/users.py (2 new routes)
    - api/services/user_service.py (modified)

╔═══════════════════════════════════════════════════╗
║  How do you want to proceed?                      ║
║                                                   ║
║  [merge]   Apply updates on top of current state  ║
║  [rebase]  Update state file first, then apply    ║
║  [force]   Ignore drift, overwrite with new spec  ║
║  [abort]   Cancel and review manually             ║
╚═══════════════════════════════════════════════════╝
```

**This maps to**: The transpiler comparing `.langc/state.json` checksums
against actual file checksums before generating UPDATE skills.

## Summary: Where the Human Lives

```
WRITE ──→ VALIDATE ──→ PLAN ──→ COMPILE ──→ APPLY ──→ REVIEW
  ▲          │            │         │          │          │
  │        Human        Human    Human     Human      Human
  │       fixes        approves  inspects  gates      accepts
  │       errors       plan      artifacts phases     output
  │                                                     │
  └─────────────── feedback loop ◄──────────────────────┘
```

Every arrow is a **human decision point**. The system never proceeds
without explicit approval. The human can always:

1. **See** what will happen (plan, compile)
2. **Approve** or **reject** at every boundary
3. **Inspect** generated artifacts before execution
4. **Control speed** via gate modes (manual → auto)
5. **Fix** issues mid-execution without starting over
6. **Rollback** if the final output isn't right
7. **Resume** from where they left off after abort

The transpiler is the human's instrument. Claude is the executor.
The human is always in the driver's seat.
