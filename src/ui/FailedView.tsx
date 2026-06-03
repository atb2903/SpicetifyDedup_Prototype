/**
 * Failure view (FR-008, NFR-004, SC-4).
 *
 * Reads the `failed` state's `PlaylistsLoaderError` from the store and
 * renders:
 *
 * - a user-facing explanation derived from `reason` via the closed
 *   `EXPLANATIONS` lookup table (the `Record<…, string>` type ensures
 *   every reason has an entry — adding a new reason to the union
 *   without a matching entry is a compile error);
 * - the underlying error message collapsed inside `<details>` for
 *   diagnostics;
 * - a Retry button that dispatches the store's `retry` action.
 *
 * If used outside the `failed` state (e.g. wiring bug in WP09) the
 * component renders nothing — a quiet noop rather than a crash.
 */

import React from 'react';
import { usePlaylistsStore } from '../store/PlaylistsStoreContext';
import type { PlaylistsLoaderErrorReason } from '../domain/errors';

const EXPLANATIONS: Record<PlaylistsLoaderErrorReason, string> = {
  'host-unavailable':
    'The Spotify client is not ready. Open Spotify and try again.',
  'host-auth-expired':
    'Your Spotify session has expired. Sign in again and retry.',
  'rootlist-fetch-failed':
    'Could not fetch your playlists. The Spotify client returned an error.',
  'rootlist-item-missing-name':
    'One of your playlists is missing a name. The Spotify client returned an unexpected response.',
  'rootlist-item-missing-owner':
    'One of your playlists is missing owner information. The Spotify client returned an unexpected response.',
  'rootlist-item-invalid-track-count':
    'One of your playlists has an invalid track count. The Spotify client returned an unexpected response.',
  'rootlist-item-missing-flag':
    'One of your playlists is missing an ownership or collaboration flag. The Spotify client returned an unexpected response.',
  'rootlist-item-unsupported-shape':
    'One of your playlists is in an unrecognized format. This often means Spotify changed its data shape — please report this.',
  'liked-songs-fetch-failed':
    'Could not fetch your Liked Songs. The Spotify client returned an error.',
  'liked-songs-invalid-track-count':
    'Your Liked Songs track count is in an unexpected format. The Spotify client returned an unexpected response.',
};

export function FailedView() {
  const loadState = usePlaylistsStore((s) => s.loadState);
  const retry = usePlaylistsStore((s) => s.retry);

  if (loadState.kind !== 'failed') return null;

  const explanation = EXPLANATIONS[loadState.reason.reason];
  const detail = loadState.reason.message;

  return (
    <div className="dedup-failed" role="alert">
      <p className="dedup-failed__explanation">{explanation}</p>
      <details className="dedup-failed__detail">
        <summary>Technical details</summary>
        <code>{detail}</code>
      </details>
      <button
        type="button"
        className="dedup-failed__retry"
        onClick={() => {
          void retry();
        }}
      >
        Retry
      </button>
    </div>
  );
}
