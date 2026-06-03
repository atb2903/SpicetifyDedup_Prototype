/**
 * Non-blocking loading indicator (FR-007).
 *
 * Stateless and propless. Exposes `role="status"` with an accessible name
 * so assistive tech announces the wait without preempting the user. There
 * is no wall-clock budget (NFR-001) — the indicator's job is purely to
 * reassure the user that the page is alive while the host APIs run.
 */

import React from 'react';

export function LoadingView() {
  return (
    <div
      className="dedup-loading"
      role="status"
      aria-label="Loading your dedup-able playlists"
    >
      <span className="dedup-loading__spinner" aria-hidden="true" />
      <span className="dedup-loading__copy">
        Loading your dedup-able playlists…
      </span>
    </div>
  );
}
