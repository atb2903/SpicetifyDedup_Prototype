/**
 * The single error type produced by the `PlaylistsLoader` port.
 *
 * The adapter throws `PlaylistsLoaderError`; the store catches it and
 * dispatches `load-failed` with the error as the `failed` state's `reason`;
 * the UI renders an explanation derived from `reason` via a small lookup
 * table, with `message` available as collapsed diagnostic detail.
 *
 * Defined in `src/domain/`; pure — no React, no Zustand, no Spicetify.
 */

/**
 * Closed enumeration of every failure mode the loader port can produce.
 * Kept in lock-step with `data-model.md` §7 — adding or removing a value
 * here breaks the UI's reason-to-message lookup table in a type-checked
 * way.
 */
export type PlaylistsLoaderErrorReason =
  | 'rootlist-fetch-failed'
  | 'rootlist-item-missing-name'
  | 'rootlist-item-missing-owner'
  | 'rootlist-item-invalid-track-count'
  | 'rootlist-item-missing-flag'
  | 'rootlist-item-unsupported-shape'
  | 'liked-songs-fetch-failed'
  | 'liked-songs-invalid-track-count'
  | 'host-unavailable'
  | 'host-auth-expired';

/**
 * Typed error class for loader-port failures. Carries a discriminator
 * (`reason`) so callers can branch on the failure mode without parsing
 * messages, and an optional `cause` so the originating error is preserved
 * for diagnostics.
 */
export class PlaylistsLoaderError extends Error {
  readonly reason: PlaylistsLoaderErrorReason;
  readonly cause?: unknown;

  constructor(
    reason: PlaylistsLoaderErrorReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'PlaylistsLoaderError';
    this.reason = reason;
    if (options && 'cause' in options && options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Classifier predicate: returns true iff `x` is a `PlaylistsLoaderError`
 * instance. Lets callers (e.g. the store) distinguish loader errors from
 * arbitrary thrown values without `instanceof` boilerplate at every site.
 */
export function isPlaylistsLoaderError(x: unknown): x is PlaylistsLoaderError {
  return x instanceof PlaylistsLoaderError;
}
