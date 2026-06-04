/**
 * Non-blocking loading indicator (FR-007).
 *
 * Stateless and propless. Exposes `role="status"` with an accessible name
 * so assistive tech announces the wait without preempting the user. There
 * is no wall-clock budget (NFR-001) — the indicator's job is purely to
 * reassure the user that the page is alive while the host APIs run.
 *
 * Styling (WP02 / T009): ships its own CSS module with a CSS-only border
 * spinner (the sole motion design permitted by C-003) above the copy.
 * The spinner colour comes from `var(--dedup-button)` so it follows the
 * active Spicetify theme.
 */

import React from 'react';
import styles from './LoadingView.module.scss';

export function LoadingView() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-label="Loading your dedup-able playlists"
    >
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.copy}>
        Loading your dedup-able playlists…
      </span>
    </div>
  );
}
