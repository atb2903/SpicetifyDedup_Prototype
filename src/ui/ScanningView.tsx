/**
 * ScanningView (WP07 / T020 / FR-009 / NFR-006).
 *
 * Presentational component that renders a `ProgressEvent` as a user-visible
 * status line. Pure: props in → JSX out; no store imports, no port imports.
 *
 * The container carries `role="status"` and `aria-live="polite"` so screen
 * readers announce stage transitions. Per-event counter updates are
 * intentionally `"polite"` rather than `"assertive"` — the host's
 * announcement cadence governs when updates are read aloud, preventing
 * rapid-fire announcements on large-library scans.
 *
 * Architecture: `src/ui/` may import from `src/domain/` but MUST NOT import
 * from `src/adapters/` or `src/ports/` (enforced by `test/architecture.test.ts`).
 *
 * Callers: WP08 wires this component into the row components.
 */

import React from 'react';
import styles from './ScanningView.module.scss';

// ---------------------------------------------------------------------------
// Types (WP01 domain types are defined locally until WP01 is merged into main)
// ---------------------------------------------------------------------------

/**
 * A progress snapshot emitted during a detection scan.
 *
 * - `enumerating`: tracks yielded so far; `total` is `null` until the first
 *   page returns a total count.
 * - `enriching`: catalog-enriched tracks completed / total to enrich.
 * - `matching`: `processed ∈ {0, total}`; two events per scan (start + end).
 */
export type ProgressEvent =
  | { stage: 'enumerating'; processed: number; total: number | null }
  | { stage: 'enriching'; processed: number; total: number }
  | { stage: 'matching'; processed: number; total: number };

/**
 * Props for {@link ScanningView}.
 */
export type ScanningViewProps = {
  /** Current progress snapshot to render. */
  progress: ProgressEvent;
};

// ---------------------------------------------------------------------------
// Stage labels (closed table — adding a stage without a label is a type error)
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<ProgressEvent['stage'], string> = {
  enumerating: 'Enumerating tracks',
  enriching: 'Enriching catalog data',
  matching: 'Matching duplicates',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render a detection scan's current progress as a labelled status line.
 *
 * @param props - `{ progress: ProgressEvent }`
 * @returns A `<div role="status" aria-live="polite">` containing the stage
 *   label and a processed / total counter.
 */
export function ScanningView({ progress }: ScanningViewProps): React.ReactElement {
  const label = STAGE_LABELS[progress.stage];
  const counter = buildCounter(progress);

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <span className={styles.label}>{label}</span>
      {counter !== null && (
        <span className={styles.counter} aria-hidden="true">
          {' · '}
          {counter}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the counter string for the given progress event.
 *
 * - `total === null` → return `String(processed)` (no denominator).
 * - `total === 0` → return `"0 / 0"` (boundary; do not divide by zero or omit).
 * - `total > 0` → return `"processed / total"`.
 *
 * @param progress - The progress event to derive the counter from.
 * @returns Counter string, or `null` when there is nothing meaningful to show.
 */
function buildCounter(progress: ProgressEvent): string | null {
  if (progress.total === null) {
    return String(progress.processed);
  }
  return `${progress.processed} / ${progress.total}`;
}
