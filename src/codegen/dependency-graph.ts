import type { CreateBlock } from "../ast/nodes.js";
import type { DependencyGraph, DependencyNode } from "./types.js";

/**
 * Build a dependency graph from CREATE blocks.
 * Performs topological sort (Kahn's algorithm) and cycle detection.
 * Also computes parallel execution phases.
 */
export function buildDependencyGraph(blocks: CreateBlock[]): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();

  // Build node map
  for (const block of blocks) {
    const id = `${block.componentType}.${block.name}`;
    const dependsOn: string[] = [];

    for (const prop of block.properties) {
      if (prop.kind === "DependsProperty") {
        for (const ref of prop.refs) {
          dependsOn.push(ref.parts.join("."));
        }
      }
    }

    nodes.set(id, { id, componentType: block.componentType, name: block.name, dependsOn });
  }

  // Topological sort (Kahn's algorithm)
  const order = topologicalSort(nodes);

  // Compute parallel phases
  const phases = computePhases(nodes, order);

  return { nodes, order, phases };
}

function topologicalSort(nodes: Map<string, DependencyNode>): string[] {
  // Compute in-degrees (only count edges within known nodes)
  const inDegree = new Map<string, number>();
  for (const [id] of nodes) {
    inDegree.set(id, 0);
  }

  for (const [, node] of nodes) {
    for (const dep of node.dependsOn) {
      if (nodes.has(dep)) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0));
        const current = inDegree.get(node.id) ?? 0;
        // Actually: dep is a prerequisite of node, so node's in-degree should count
      }
    }
  }

  // Recompute properly: for each node, count how many of its deps are in the graph
  for (const [id] of nodes) {
    inDegree.set(id, 0);
  }
  for (const [, node] of nodes) {
    for (const dep of node.dependsOn) {
      if (nodes.has(dep)) {
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  // Sort for deterministic output
  queue.sort();

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // For each node that depends on current, decrement its in-degree
    for (const [, node] of nodes) {
      if (node.dependsOn.includes(current)) {
        const newDeg = (inDegree.get(node.id) ?? 1) - 1;
        inDegree.set(node.id, newDeg);
        if (newDeg === 0) {
          queue.push(node.id);
          queue.sort();
        }
      }
    }
  }

  // Cycle detection
  if (result.length !== nodes.size) {
    const remaining = [...nodes.keys()].filter(id => !result.includes(id));
    throw new Error(
      `Dependency cycle detected involving: ${remaining.join(", ")}`,
    );
  }

  return result;
}

function computePhases(
  nodes: Map<string, DependencyNode>,
  order: string[],
): string[][] {
  if (order.length === 0) return [];

  // Assign each node to the earliest phase where all deps are satisfied
  const phaseOf = new Map<string, number>();

  for (const id of order) {
    const node = nodes.get(id)!;
    let maxDepPhase = -1;

    for (const dep of node.dependsOn) {
      if (phaseOf.has(dep)) {
        maxDepPhase = Math.max(maxDepPhase, phaseOf.get(dep)!);
      }
    }

    phaseOf.set(id, maxDepPhase + 1);
  }

  // Group by phase
  const maxPhase = Math.max(...phaseOf.values());
  const phases: string[][] = [];
  for (let i = 0; i <= maxPhase; i++) {
    const phase: string[] = [];
    for (const id of order) {
      if (phaseOf.get(id) === i) {
        phase.push(id);
      }
    }
    phases.push(phase);
  }

  return phases;
}

export { topologicalSort, computePhases };
