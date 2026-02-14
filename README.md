# LangC — A Transpiler for Claude Orchestration

## Vision

LangC is a Domain-Specific Language (DSL) that transpiles structured, concise instructions into Claude orchestration plans. Instead of writing unstructured natural language prompts, users write in a deterministic, parseable syntax that compiles into optimized Claude commands — achieving better context management, prompt management, and repeatable outputs.

## Architecture

```
[Your DSL]  -->  [Transpiler]  -->  [Claude Orchestration Plan]  -->  [Claude Executes]
     ^                                        ^
  Human writes                     CLAUDE.md / tasks / sub-agents
```

The transpiler does not produce application code directly. It produces a **plan** — structured instructions (CLAUDE.md files, sub-agent definitions, team tasks, skills, commands) that Claude follows to build the final application.

## Core Concepts

| Concept | Purpose |
|---------|---------|
| **ACT** | Actions/verbs — what to do (Create, Update) |
| **TYPE** | Targets/nouns — what to act on (API, METHOD, FNC) |
| **LNG** | Language constraint — restricts Claude's output language |
| **INST** | Instructions — combines actions + targets into executable commands |
| **CMD** | Commands — the concrete operations within instructions |

## Example (Early Pseudocode)

```
ACT {
    Create
    Update
}

TYPE {
    API,
    METHOD,
    FNC
}

LNG = python

INST {
    CMD {
        [TYPE]
    }
}

INST = CMD.CREATE(TYPE.FNC, TYPE.METHOD)
```

## Expected Outcome

When the transpiler processes a `.langc` file, it produces:
- A structured set of instructions for a CLAUDE.md file
- Sub-agent definitions and team task assignments
- Skills and commands for Claude to follow

## Design Principles

1. **Verbs + Nouns + Context** — Actions are separated from targets, with enough context for Claude to act
2. **Conciseness over verbosity** — 10x shorter than equivalent natural language prompts
3. **Deterministic output** — Same input always produces the same orchestration plan
4. **Iterative** — Support for updating and modifying existing structures, not just creating new ones

## Open Design Questions

- **Granularity**: Is one DSL file = one project? One feature? One task?
- **Context**: How does the user provide descriptions and business logic? Pure DSL or DSL + natural language blocks?
- **Output format**: Is the target literally a CLAUDE.md file? A sequence of prompts? A task list?
- **Iteration**: Can the user say `UPDATE FNC "auth"` later and have it modify existing code?

## References

- [Superpower (parser combinator library)](https://github.com/datalust/superpower) — Reference for tokenizer/parser architecture
