import { createHash } from "node:crypto";

/**
 * Compute a SHA-256 checksum for content.
 * Used for state tracking and drift detection.
 */
export function computeChecksum(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex").slice(0, 12);
}

/**
 * Compute checksums for all generated files belonging to a component.
 * Returns a combined checksum representing the full component state.
 */
export function computeComponentChecksum(fileContents: string[]): string {
  const combined = fileContents.sort().join("\n---\n");
  return computeChecksum(combined);
}
