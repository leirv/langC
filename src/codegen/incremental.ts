import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CreateBlock } from "../ast/nodes.js";
import { computeChecksum } from "./checksum.js";

/**
 * Previous state loaded from .langc/state.json.
 */
interface PreviousState {
  components: Record<string, { checksum: string; status: string }>;
  phase_status?: Array<{ phase: number; components: string[]; status: string }>;
}

/**
 * Result of incremental analysis.
 */
export interface IncrementalResult {
  changed: string[];   // component IDs that changed
  unchanged: string[]; // component IDs with matching checksums
  added: string[];     // new components not in previous state
  removed: string[];   // components in state but not in current AST
}

/**
 * Resume info — which phases were already completed.
 */
export interface ResumeInfo {
  canResume: boolean;
  completedPhases: number[];
  nextPhase: number | null;
  completedComponents: string[];
}

/**
 * Serialize a block into a deterministic string for checksum comparison.
 * Must match the serialization in state.ts.
 */
function serializeBlock(block: CreateBlock): string {
  const parts: string[] = [];
  parts.push(`${block.componentType}:${block.name}`);

  for (const prop of block.properties) {
    if (prop.kind === "LngProperty") parts.push(`lng=${prop.value}`);
    if (prop.kind === "FrameworkProperty") parts.push(`fw=${prop.value}`);
    if (prop.kind === "DependsProperty") {
      parts.push(`deps=${prop.refs.map(r => r.parts.join(".")).join(",")}`);
    }
  }

  for (const member of block.members) {
    if (member.kind === "MethodDecl") {
      parts.push(`method:${member.httpMethod}:${member.path}:${member.description}`);
    } else if (member.kind === "TableDecl") {
      parts.push(`table:${member.name}:${member.columns.map(c => `${c.name}:${c.dataType}`).join(",")}`);
    } else if (member.kind === "DisplayDecl") {
      parts.push(`display:${member.description}`);
    }
  }

  return parts.join("\n");
}

/**
 * Load previous state from .langc/state.json in the output directory.
 */
export function loadPreviousState(outputDir: string): PreviousState | null {
  const statePath = join(outputDir, ".langc", "state.json");
  if (!existsSync(statePath)) return null;

  try {
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as PreviousState;
  } catch {
    return null;
  }
}

/**
 * Compare current blocks against previous state to find what changed.
 */
export function computeIncremental(
  blocks: CreateBlock[],
  previousState: PreviousState | null,
): IncrementalResult {
  if (!previousState) {
    // No previous state — everything is new
    const allIds = blocks.map(b => `${b.componentType}.${b.name}`);
    return { changed: [], unchanged: [], added: allIds, removed: [] };
  }

  const currentIds = new Set<string>();
  const changed: string[] = [];
  const unchanged: string[] = [];
  const added: string[] = [];

  for (const block of blocks) {
    const id = `${block.componentType}.${block.name}`;
    currentIds.add(id);

    const prevComponent = previousState.components[id];
    if (!prevComponent) {
      added.push(id);
      continue;
    }

    const currentChecksum = computeChecksum(serializeBlock(block));
    if (currentChecksum === prevComponent.checksum) {
      unchanged.push(id);
    } else {
      changed.push(id);
    }
  }

  // Find removed components
  const removed = Object.keys(previousState.components)
    .filter(id => !currentIds.has(id));

  return { changed, unchanged, added, removed };
}

/**
 * Determine resume info from previous state — which phases are done.
 */
export function getResumeInfo(outputDir: string): ResumeInfo {
  const prevState = loadPreviousState(outputDir);

  if (!prevState) {
    return { canResume: false, completedPhases: [], nextPhase: null, completedComponents: [] };
  }

  const state = prevState as PreviousState;

  // Check phase_status
  if (!state.phase_status || state.phase_status.length === 0) {
    // Legacy state without phase tracking — check individual component statuses
    const completed = Object.entries(state.components)
      .filter(([_, c]) => c.status === "completed")
      .map(([id]) => id);

    return {
      canResume: completed.length > 0,
      completedPhases: [],
      nextPhase: null,
      completedComponents: completed,
    };
  }

  const completedPhases: number[] = [];
  const completedComponents: string[] = [];

  for (const ps of state.phase_status) {
    if (ps.status === "completed") {
      completedPhases.push(ps.phase);
      completedComponents.push(...ps.components);
    }
  }

  const allPhases = state.phase_status.map(ps => ps.phase);
  const pendingPhases = allPhases.filter(p => !completedPhases.includes(p));
  const nextPhase = pendingPhases.length > 0 ? Math.min(...pendingPhases) : null;

  return {
    canResume: completedPhases.length > 0 && nextPhase !== null,
    completedPhases,
    nextPhase,
    completedComponents,
  };
}
