/**
 * Domain types and view-model transform for the load-dedupable-playlists page.
 *
 * Pure TypeScript — no React, Zustand, or Spicetify imports allowed
 * (enforced by `test/architecture.test.ts`).
 *
 * Type definitions mirror `data-model.md` §1–§5 letter-for-letter. The
 * adapter (WP05) validates host responses against these shapes and the
 * domain trusts them by construction; runtime validation lives only at
 * the adapter boundary, with one exception: `isRawCollection` is the
 * classifier predicate exported here (per charter: fail-loud parsing
 * paired with a classifier).
 */

/** A row's discriminator for rendering. */
export type CollectionKind = 'playlist' | 'liked-songs';

/**
 * Who owns a collection — drives the per-row owner label.
 *
 * - `self` — the signed-in user. `displayName` is the user's display name.
 * - `other` — a collaborative playlist owned by another user; the user
 *   has edit rights. `displayName` is the other user's display name.
 * - `system-library` — the virtual Liked Songs row. Labeled "Your Library"
 *   in the UI; no display name needed.
 */
export type OwnerIdentity =
  | { kind: 'self'; displayName: string }
  | { kind: 'other'; displayName: string }
  | { kind: 'system-library' };

/**
 * Raw rootlist item returned by the `PlaylistsLoader` port before
 * eligibility filtering or ordering. Produced by the adapter; consumed
 * by the domain.
 *
 * Adapter-enforced validation rules (see data-model.md §3):
 * - `uri` non-empty; type is `playlist` or `playlist-v2`.
 * - `name` non-empty.
 * - `owner.displayName` non-empty when `kind` is `'self'` or `'other'`.
 * - `trackCount` integer ≥ 0.
 * - `imageUrl` is `null` or a non-empty string.
 * - `isOwnedByMe`, `isCollaborative`, `canEdit` are strict booleans.
 */
export type RawCollection = {
  uri: string;
  name: string;
  owner: OwnerIdentity;
  trackCount: number;
  imageUrl: string | null;
  isOwnedByMe: boolean;
  isCollaborative: boolean;
  canEdit: boolean;
};

/**
 * Liked Songs summary returned by the loader port.
 *
 * Only the track count is needed in this iteration; Liked Songs has no
 * `uri` (virtual collection), no editable name (system-owned), and no
 * per-row image (UI renders a constant heart icon).
 *
 * Adapter-enforced validation: `trackCount` integer ≥ 0; otherwise
 * `PlaylistsLoaderError('liked-songs-invalid-track-count', …)`.
 */
export type LikedSongsSummary = {
  trackCount: number;
};

/**
 * A single row in the rendered list.
 *
 * Produced by `toViewModels` from a filtered+ordered list of
 * `RawCollection`s plus the `LikedSongsSummary`. The UI iterates over
 * `CollectionViewModel[]` and never sees raw host shapes.
 *
 * `key` is stable across re-renders: `uri` for playlists, the literal
 * `'liked-songs'` for the pinned row.
 */
export type CollectionViewModel = {
  key: string;
  kind: CollectionKind;
  displayName: string;
  owner: OwnerIdentity;
  trackCount: number;
  imageUrl: string | null;
};

/**
 * Converts an eligible-and-ordered `RawCollection[]` plus the
 * `LikedSongsSummary` into the array of `CollectionViewModel`s the UI
 * iterates over.
 *
 * Pins the Liked Songs row first (FR-003/FR-006), then yields each
 * eligible playlist in input order. Total — every input produces an
 * output; no item is silently dropped (drops happen earlier, in
 * `isEligible`).
 *
 * Eligibility filtering and ordering are caller responsibilities; this
 * function trusts its inputs are already filtered and ordered.
 */
export function toViewModels(
  eligible: RawCollection[],
  likedSongs: LikedSongsSummary,
): CollectionViewModel[] {
  const likedRow: CollectionViewModel = {
    key: 'liked-songs',
    kind: 'liked-songs',
    displayName: 'Liked Songs',
    owner: { kind: 'system-library' },
    trackCount: likedSongs.trackCount,
    imageUrl: null,
  };
  const playlistRows: CollectionViewModel[] = eligible.map((c) => ({
    key: c.uri,
    kind: 'playlist',
    displayName: c.name,
    owner: c.owner,
    trackCount: c.trackCount,
    imageUrl: c.imageUrl,
  }));
  return [likedRow, ...playlistRows];
}

/**
 * Classifier predicate for `RawCollection`. The adapter uses this to
 * pre-check Platform responses before triggering a typed-error throw.
 * Per charter: "fail loud + paired classifier".
 *
 * Returns true iff `x` structurally matches `RawCollection`: every
 * required field present with the right type, every numeric bound
 * satisfied (`trackCount` integer ≥ 0), and `owner` matches one of the
 * `OwnerIdentity` variants (with non-empty `displayName` for `self`
 * and `other`).
 */
export function isRawCollection(x: unknown): x is RawCollection {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.uri === 'string' &&
    r.uri.length > 0 &&
    typeof r.name === 'string' &&
    isOwnerIdentity(r.owner) &&
    typeof r.trackCount === 'number' &&
    Number.isInteger(r.trackCount) &&
    r.trackCount >= 0 &&
    (r.imageUrl === null || typeof r.imageUrl === 'string') &&
    typeof r.isOwnedByMe === 'boolean' &&
    typeof r.isCollaborative === 'boolean' &&
    typeof r.canEdit === 'boolean'
  );
}

function isOwnerIdentity(x: unknown): x is OwnerIdentity {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.kind === 'self' || o.kind === 'other') {
    return typeof o.displayName === 'string' && o.displayName.length > 0;
  }
  if (o.kind === 'system-library') return true;
  return false;
}
