/**
 * Empty-state view (FR-009, SC-5).
 *
 * Reached when the load succeeded but the user has no dedup-eligible
 * collections (zero owned/collaborative playlists *and* zero Liked
 * Songs). Intentionally has no spinner, no retry button, and no error
 * styling — it must read as a normal outcome, not a stuck or failed one.
 *
 * Styling (WP02 / T011): ships its own CSS module so the empty state
 * reads visually distinct from the four other state views (FR-003). The
 * module uses calm neutral colours via `var(--dedup-subtext)` tokens —
 * no red, no alert role — so it cannot be mistaken for `FailedView`.
 */

import React from 'react';
import styles from './EmptyView.module.scss';

export function EmptyView() {
  return (
    <div className={styles.container}>
      <p className={styles.copy}>
        No dedup-eligible collections in your library.
      </p>
    </div>
  );
}
