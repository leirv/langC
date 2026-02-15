import type {
  Program, ProjectDecl, CreateBlock, UpdateBlock,
  ProfileDecl, ComponentType,
} from "../ast/nodes.js";

// ── Generated output ──

export interface GeneratedFile {
  path: string;   // relative to output dir, e.g. "CLAUDE.md"
  content: string;
}

// ── Resolved profile (after import resolution + EXTENDS flattening) ──

export interface ResolvedProfile {
  name: string;
  role: string | null;
  rules: string[];
  patterns: { componentType: string; pattern: string }[];
  onReview: string[];
}

// ── Dependency graph ──

export interface DependencyNode {
  id: string;                // e.g. "DB.users-db"
  componentType: ComponentType;
  name: string;
  dependsOn: string[];      // ids of dependencies
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  order: string[];           // topological order
  phases: string[][];        // parallel execution phases
}

// ── Compilation context (shared input to all generators) ──

export interface CompilationContext {
  projectName: string;
  scope: string;
  reference: string;
  profiles: ResolvedProfile[];
  profileExcepts: Map<string, string | null>; // profile name -> except rule
  createBlocks: CreateBlock[];
  updateBlocks: UpdateBlock[];
  dependencyGraph: DependencyGraph;
  ast: Program;
  project: ProjectDecl;
}
