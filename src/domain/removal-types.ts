/**
 * Pure value types for the duplicate-track removal pipeline.
 *
 * Every shape the removal transforms, port, store, and UI reference lives
 * here. No imports outside `src/domain/`; no runtime values — this is a
 * types-only module (zero JS output; coverage tooling reports 0/0, which is
 * expected per the WP01 test strategy).
 *
 * Type placement reference: data-model.md §2.
 *
 * Architectural constraint (ADR-0001 / test/architecture.test.ts):
 * `src/domain/` may only import other `src/domain/` files.
 */

// ── §2.1 — RemovalTarget ─────────────────────────────────────────────────────

/**
 * The single collection a removal targets. Removal scope is one collection
 * per operation (C-003) — there is no global/all-collections variant, which
 * keeps the cross-playlist-acknowledgement risk boundary unreachable.
 *
 * Discriminated by `kind`:
 * - `'liked-songs'` — the user's Liked Songs library. Addressed by URI alone.
 * - `'playlist'` — a specific playlist identified by `playlistUri`. Repeated
 *   URIs within the playlist are disambiguated by each `TrackRef.uid`.
 */
export type RemovalTarget =
  | { kind: 'liked-songs' }
  | { kind: 'playlist'; playlistUri: string };

// ── §2.2 — TrackRef ──────────────────────────────────────────────────────────

/**
 * A reference to exactly one track occurrence to delete.
 *
 * - Liked Songs: `uid` is `undefined`; `uri` is the unique key (a track
 *   appears at most once in Liked Songs).
 * - Playlist: `uid` is **required** and names the specific item occurrence,
 *   so a repeated URI's later copies can be deleted without touching the
 *   kept copy. (ADR-0012)
 *
 * Invariant: for a playlist `RemovalTarget`, `uid` is a defined non-empty
 * string; for Liked Songs it is `undefined`.
 */
export type TrackRef = { uri: string; uid?: string };

// ── §2.3 — RemoveSet ─────────────────────────────────────────────────────────

/**
 * The ordered set of tracks to delete from one collection — the output of
 * `computeRemoveSet` (WP02) and the input to `RemovalExecutor.remove` (WP03).
 *
 * Invariant: `tracks.length === sourceResult.removableTrackCount` (FR-004) —
 * every group's members except the kept earliest copy. For a playlist target
 * every `TrackRef` carries a defined `uid`; for Liked Songs none do.
 */
export type RemoveSet = {
  /** Echoes the source `DetectionResult.collectionKey` for traceability. */
  collectionKey: string;
  /**
   * Tracks to delete, ascending by each member's original `position`
   * (i.e. the later copies of every duplicate group, earliest kept).
   */
  tracks: ReadonlyArray<TrackRef>;
};

// ── §2.4 — RemovalOutcome ────────────────────────────────────────────────────

/**
 * Per-collection result of a removal attempt (FR-010 / AS-8). Partitions the
 * requested tracks into those the host confirmed deleted and those that
 * failed (with a host-supplied reason), so the UI can keep the unremoved
 * copies visible.
 *
 * Invariants:
 * - `removed.length + failed.length === requested.length` (the `RemoveSet`
 *   that produced this outcome) — every requested track is accounted for.
 * - `removed` and `failed` are disjoint by `TrackRef` identity (playlist →
 *   `uid`, Liked Songs → `uri`); no track appears in both.
 */
export type RemovalOutcome = {
  /** Tracks the host confirmed deleted. */
  removed: ReadonlyArray<TrackRef>;
  /** Tracks that could not be deleted, each with a host-supplied reason. */
  failed: ReadonlyArray<{ track: TrackRef; reason: string }>;
};

// ── §2.5 — RemovalProgressEvent ──────────────────────────────────────────────

/**
 * Progress for large removals (NFR-002). Optional; emitted per batch by the
 * executor so the `removing` FSM phase can render a live counter.
 *
 * Invariant: `0 <= removedSoFar <= total`; `total` equals the originating
 * `RemoveSet.tracks.length`.
 */
export type RemovalProgressEvent = {
  /** Count of tracks deleted so far in this removal. */
  removedSoFar: number;
  /** Total tracks requested for this removal. */
  total: number;
};
