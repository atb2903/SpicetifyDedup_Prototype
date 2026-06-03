/**
 * Empty-state view (FR-009, SC-5).
 *
 * Reached when the load succeeded but the user has no dedup-eligible
 * collections (zero owned/collaborative playlists *and* zero Liked
 * Songs). Intentionally has no spinner, no retry button, and no error
 * styling — it must read as a normal outcome, not a stuck or failed one.
 */

import React from 'react';

export function EmptyView() {
  return (
    <div className="dedup-empty">
      <p className="dedup-empty__copy">
        No dedup-eligible collections in your library.
      </p>
    </div>
  );
}
