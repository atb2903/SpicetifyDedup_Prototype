/**
 * DetectionFailedView (WP07 / T022 / NFR-005 / AS-8).
 *
 * Presentational component that renders a `DetectionError` as a user-visible
 * error message via a closed reason-to-label lookup table.
 *
 * Pure: props in → JSX out; no store imports, no port imports.
 *
 * The switch over `reason.reason` uses a `never`-typed catch clause to
 * enforce exhaustiveness at compile time — adding a new `DetectionErrorReason`
 * to the union without adding a matching case becomes a `tsc` error.
 *
 * Note on `'aborted'`: the store catches `AbortError` and transitions the
 * row back to `idle`; it NEVER dispatches a `fail` action with reason
 * `'aborted'`. If this component is rendered with `'aborted'`, it indicates
 * a bug in the store wiring. The component renders a defensive fallback
 * ("Scan cancelled") rather than crashing. The test for this path is
 * explicitly a bug-indicator test.
 *
 * Architecture: `src/ui/` may import from `src/domain/` but MUST NOT import
 * from `src/adapters/` or `src/ports/` (enforced by `test/architecture.test.ts`).
 *
 * Callers: WP08 wires this component into the row components.
 */

import React from 'react';
import type { DetectionError } from '../domain/detection-errors';
import styles from './DetectionFailedView.module.scss';

/**
 * Props for {@link DetectionFailedView}.
 *
 * Consumes the canonical {@link DetectionError} by import (NFR-001) — no local
 * re-declaration. The view reads only `reason` for messaging; `context` is not
 * inspected (FR-008 — no producer sets a messaging status).
 */
export type DetectionFailedViewProps = {
  /** The detection error to render. */
  reason: DetectionError;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render a detection failure as a user-visible error message.
 *
 * Uses a closed `switch` statement with a `never` exhaustiveness check so
 * adding a new `DetectionErrorReason` without a label entry is a `tsc` error.
 *
 * @param props - `{ reason: DetectionError }`
 * @returns A `<div role="alert">` containing the error copy.
 */
export function DetectionFailedView({
  reason,
}: DetectionFailedViewProps): React.ReactElement {
  const message = buildMessage(reason);

  return (
    <div className={styles.container} role="alert">
      <p className={styles.message}>{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a `DetectionError` to the user-visible label string.
 *
 * The `never` branch at the bottom enforces exhaustiveness: TypeScript will
 * reject compilation if any `DetectionErrorReason` variant is unhandled.
 *
 * @param error - The detection error to label.
 * @returns The user-visible message string.
 */
function buildMessage(error: DetectionError): string {
  switch (error.reason) {
    case 'auth-token-expired':
      return 'Spotify signed out mid-scan — sign back in and retry.';

    case 'enumerator-failed':
      return "Couldn't read the playlist contents. Try again.";

    case 'host-unavailable':
      // Matches the dedicated host-unavailable signal of the removal and
      // playlists paths (SC-007).
      return 'The Spotify client is not ready. Try again in a moment.';

    case 'internal-error':
      // Honest internal fault (SC-004). The live, inline-enricher pipeline
      // performs no catalog lookup, so this MUST NOT mention a catalog or a
      // Spotify rejection.
      return 'Something went wrong while scanning. Try again.';

    case 'aborted':
      // This path indicates a store wiring bug — 'aborted' should never
      // result in a 'failed' row state. Render a graceful fallback.
      return 'Scan cancelled.';

    default: {
      // Exhaustiveness check: TypeScript narrows `error.reason` to `never`
      // here. If a new reason is added to the union without a case above,
      // the assignment below becomes a compile error.
      const _exhaustive: never = error.reason;
      return `Unknown error: ${String(_exhaustive)}`;
    }
  }
}
