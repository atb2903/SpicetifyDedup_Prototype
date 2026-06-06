/**
 * Per-row Dedup affordance (FR-001, FR-002, NFR-001, NFR-002).
 *
 * Presentational React component. Accepts the host playlist's display
 * name and canonical Spotify URI as two separate string props
 * (data-model §1, research Decision 3) and renders a native
 * `<button type="button">`. On activation — mouse click, Enter, or
 * Space on the focused button — invokes `logDedupClick(name, uri)`
 * from `./dedup-click-log` which writes one diagnostic line of the
 * form `[Dedup] clicked: <name> (<uri>)` (FR-003).
 *
 * Accessibility contract:
 *  - Visible text is the literal word "Dedup" (Decision 8).
 *  - The accessible name is `Dedup <playlistName>` via `aria-label`
 *    so screen readers announce which row's button has focus (NFR-002).
 *  - Native `<button>` is tab-focusable by default (NFR-001).
 *
 * Side-effect contract:
 *  - Does NOT call any Spicetify host API.
 *  - Does NOT mutate any store, library, or playlist.
 *  - Does NOT render any user-visible confirmation.
 *  - The only side effect is the single `console.log` from
 *    `logDedupClick`. The temporary diagnostic surface is documented
 *    at `.claude/adr/0006-console-only-dedup-click-confirmation.md`
 *    (FR-007, C-001).
 *
 * The component imports only `react`, `./dedup-click-log`, and the
 * sibling `./DedupButton.module.scss` — adapter and port imports are
 * forbidden from `src/ui/` by `test/architecture.test.ts`.
 */

import React from 'react';
import { logDedupClick } from './dedup-click-log';
import styles from './DedupButton.module.scss';

/**
 * Props for {@link DedupButton}.
 *
 * Two independent string props rather than a single object so the
 * component's API is the smallest possible surface that satisfies the
 * data-model contract (no implicit derivations from a richer
 * view-model — callers pass exactly what they want logged).
 */
export type DedupButtonProps = {
  /** Display name of the playlist. Used verbatim in the aria-label and the log line. */
  playlistName: string;
  /** Canonical Spotify URI (e.g. `spotify:playlist:abc`). Logged verbatim. */
  playlistUri: string;
};

/**
 * Render the Dedup button for a single playlist row.
 *
 * Activation routes through `logDedupClick` so the diagnostic format
 * lives in exactly one place (WP01 surface). Future missions replace
 * the helper body to do real work without changing this component's
 * signature.
 */
export function DedupButton({ playlistName, playlistUri }: DedupButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={`Dedup ${playlistName}`}
      onClick={() => logDedupClick(playlistName, playlistUri)}
    >
      Dedup
    </button>
  );
}
