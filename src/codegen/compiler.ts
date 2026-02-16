import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import type { Program, ProjectDecl, ProfileDecl, ProfileRef, CreateBlock, UpdateBlock } from "../ast/nodes.js";
import type { CompilationContext, GeneratedFile, ResolvedProfile } from "./types.js";
import type { Generator } from "./generator.js";
import { resolveImports } from "./import-resolver.js";
import { buildDependencyGraph } from "./dependency-graph.js";
import { builtinProfiles } from "./builtin-profiles.js";
import { ClaudeMdGenerator } from "./generators/claude-md.js";
import { CreateSkillGenerator } from "./generators/create-skill.js";
import { UpdateSkillGenerator } from "./generators/update-skill.js";
import { AgentGenerator } from "./generators/agent.js";
import { RulesGenerator } from "./generators/rules.js";
import { HooksGenerator } from "./generators/hooks.js";
import { OrchestrateGenerator } from "./generators/orchestrate.js";
import { StateGenerator } from "./generators/state.js";
import { LngRulesGenerator } from "./generators/lng-rules.js";
import { PlanSkillGenerator } from "./generators/plan-skill.js";
import { loadPreviousState, computeIncremental } from "./incremental.js";
import type { IncrementalResult } from "./incremental.js";

export interface CompileResult {
  files: GeneratedFile[];
  context: CompilationContext;
  incremental: IncrementalResult | null;
}

export class Compiler {
  private generators: Generator[] = [];

  constructor() {
    // Phase 2a generators
    this.generators.push(new ClaudeMdGenerator());
    this.generators.push(new CreateSkillGenerator());
    this.generators.push(new UpdateSkillGenerator());
    // Phase 2b generators
    this.generators.push(new AgentGenerator());
    this.generators.push(new RulesGenerator());
    this.generators.push(new LngRulesGenerator());
    this.generators.push(new HooksGenerator());
    // Phase 2c generators
    this.generators.push(new OrchestrateGenerator());
    this.generators.push(new StateGenerator());
    this.generators.push(new PlanSkillGenerator());
  }

  addGenerator(gen: Generator): void {
    this.generators.push(gen);
  }

  compile(filePath: string): CompileResult {
    const absPath = resolve(filePath);
    const source = readFileSync(absPath, "utf-8");
    return this.compileSource(source, absPath);
  }

  compileSource(source: string, filePath: string): CompileResult {
    // Parse
    const { tokens, errors: lexErrors } = new Lexer(source).tokenize();
    if (lexErrors.length > 0) {
      throw new Error(`Lexer errors in ${filePath}:\n${lexErrors.map(e => `  ${e.line}:${e.column} ${e.message}`).join("\n")}`);
    }

    const { ast, errors: parseErrors } = new Parser(tokens).parse();
    if (parseErrors.length > 0) {
      throw new Error(`Parse errors in ${filePath}:\n${parseErrors.map(e => `  ${e.line}:${e.column} ${e.message}`).join("\n")}`);
    }

    // Build context
    const ctx = this.buildContext(ast, filePath);

    // Incremental check
    const prevState = loadPreviousState(ctx.projectName);
    const incremental = computeIncremental(ctx.createBlocks, prevState);

    // Generate
    const files: GeneratedFile[] = [];
    for (const gen of this.generators) {
      files.push(...gen.generate(ctx));
    }

    return { files, context: ctx, incremental };
  }

  private buildContext(ast: Program, filePath: string): CompilationContext {
    // Find the project declaration
    const project = ast.declarations.find(
      (d): d is ProjectDecl => d.kind === "ProjectDecl",
    );
    if (!project) {
      throw new Error("No PROJECT declaration found");
    }

    // Extract project properties
    const scope = this.getProjectProp(project, "ScopeProperty") ?? "full";
    const reference = this.getProjectProp(project, "ReferenceProperty") ?? "none";
    const gate = this.getProjectProp(project, "GateProperty") ?? "phase-by-phase";
    const projectCtx = this.getProjectProp(project, "CtxProperty");

    // Get profile refs
    const profilesProp = project.properties.find(p => p.kind === "ProfilesProperty");
    const profileRefs: ProfileRef[] = profilesProp?.kind === "ProfilesProperty"
      ? profilesProp.names
      : [];

    // Extract inline profiles from declarations
    const inlineProfiles = ast.declarations.filter(
      (d): d is ProfileDecl => d.kind === "ProfileDecl",
    );

    // File reader for imports
    const fileReader = (path: string): string => {
      return readFileSync(path, "utf-8");
    };

    // Resolve profiles
    const profiles = resolveImports(
      ast.imports,
      inlineProfiles,
      profileRefs,
      fileReader,
      filePath,
    );

    // Build except map
    const profileExcepts = new Map<string, string | null>();
    for (const ref of profileRefs) {
      profileExcepts.set(ref.name, ref.except);
    }

    // Separate blocks
    const createBlocks: CreateBlock[] = [];
    const updateBlocks: UpdateBlock[] = [];
    for (const block of project.blocks) {
      if (block.kind === "CreateBlock") createBlocks.push(block);
      else if (block.kind === "UpdateBlock") updateBlocks.push(block);
    }

    // Resolve block-scoped PROFILES +=
    const blockProfiles = this.resolveBlockProfiles(
      createBlocks, ast, inlineProfiles, fileReader, filePath,
    );

    // Build block-level CTX map
    const blockCtx = new Map<string, string>();
    for (const block of createBlocks) {
      const ctxProp = block.properties.find(p => p.kind === "CtxProperty");
      if (ctxProp && "value" in ctxProp) {
        blockCtx.set(`${block.componentType}.${block.name}`, (ctxProp as { value: string }).value);
      }
    }

    // Build dependency graph
    const dependencyGraph = buildDependencyGraph(createBlocks);

    return {
      projectName: project.name,
      scope,
      reference,
      gate,
      profiles,
      profileExcepts,
      blockProfiles,
      projectCtx,
      blockCtx,
      createBlocks,
      updateBlocks,
      dependencyGraph,
      ast,
      project,
    };
  }

  private resolveBlockProfiles(
    blocks: CreateBlock[],
    ast: Program,
    inlineProfiles: ProfileDecl[],
    fileReader: (path: string) => string,
    filePath: string,
  ): Map<string, ResolvedProfile[]> {
    const result = new Map<string, ResolvedProfile[]>();

    for (const block of blocks) {
      const blockId = `${block.componentType}.${block.name}`;
      const addProps = block.properties.filter(p => p.kind === "ProfilesAddProperty");

      if (addProps.length === 0) continue;

      const refs: ProfileRef[] = [];
      for (const prop of addProps) {
        if (prop.kind === "ProfilesAddProperty") {
          refs.push(...prop.names);
        }
      }

      if (refs.length > 0) {
        const resolved = resolveImports(
          ast.imports, inlineProfiles, refs, fileReader, filePath,
        );
        result.set(blockId, resolved);
      }
    }

    return result;
  }

  private getProjectProp(project: ProjectDecl, kind: string): string | null {
    for (const p of project.properties) {
      if (p.kind === kind && "value" in p) return (p as { value: string }).value;
    }
    return null;
  }
}
