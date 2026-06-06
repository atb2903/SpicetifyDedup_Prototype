/**
 * Emit a single confirmation line to the dev console identifying which
 * playlist row's Dedup button was activated.
 *
 * Format (FR-003): `[Dedup] clicked: <name> (<uri>)`. Name and URI are
 * passed verbatim — no escaping, no truncation, no trimming. Empty or
 * whitespace-only names are written through as-is per the spec's edge
 * cases.
 *
 * One side effect per call: a single `console.log`. Synchronous, no
 * return value, no error path (FR-007, C-001). The temporary diagnostic
 * surface that ADR-0006 covers; a future mission replaces this body
 * without changing the signature.
 */
export function logDedupClick(name: string, uri: string): void {
  console.log(`[Dedup] clicked: ${name} (${uri})`);
}
