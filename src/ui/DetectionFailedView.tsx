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
import styles from './DetectionFailedView.module.scss';

// ---------------------------------------------------------------------------
// Types (WP01 domain types are defined locally until WP01 is merged into main)
// ---------------------------------------------------------------------------

/**
 * The closed set of reasons a detection scan can fail.
 * Mirrors `DetectionErrorReason` from `src/domain/detection-errors.ts` (WP01).
 */
export type DetectionErrorReason =
  | 'auth-token-expired'
  | 'rate-limit-unparseable'
  | 'network-failure'
  | 'malformed-enrichment-payload'
  | 'enumerator-failed'
  | 'catalog-rejected'
  | 'aborted';

/**
 * A typed detection error. Mirrors `DetectionError` from
 * `src/domain/detection-errors.ts` (WP01) — expressed as a plain object here
 * so tests can construct it without importing the class.
 */
export type DetectionError = {
  /** Discriminant identifying which failure mode occurred. */
  reason: DetectionErrorReason;
  /** Human-readable message for diagnostics. */
  message: string;
  /**
   * Optional structured payload.
   * - `catalog-rejected`: may include `{ status: number }`.
   */
  context?: Readonly<Record<string, unknown>>;
};

/**
 * Props for {@link DetectionFailedView}.
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

    case 'rate-limit-unparseable':
      return "Spotify is throttling and didn't tell us when to retry. Try again in a minute.";

    case 'network-failure':
      return "Couldn't reach Spotify. Check your connection and retry.";

    case 'malformed-enrichment-payload':
      return 'Spotify returned unexpected data. This is a bug — please report it.';

    case 'enumerator-failed':
      return "Couldn't read the playlist contents. Try again.";

    case 'catalog-rejected': {
      const status =
        typeof error.context?.['status'] === 'number'
          ? error.context['status']
          : null;
      const suffix = status !== null ? ` (status ${status})` : '';
      return `Spotify rejected the catalog lookup${suffix}. Try again.`;
    }

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
