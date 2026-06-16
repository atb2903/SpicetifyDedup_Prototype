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
 * Typed provenance of a `RemovalOutcome` — the single source of truth for how
 * a removal ended, replacing the brittle `stalled:` / `executor-failed:`
 * `reason`-string-prefix protocol the store and `RemovalOutcomeView` used to
 * share (NFR-004 / ADR-0020). No layer derives control flow from `reason`
 * strings any more; the view branches on this discriminator.
 *
 * Per-provenance invariants (data-model.md §3 / contracts/removal-outcome-provenance.md):
 * - `'host'` — the executor's host-truthful result (full completion or a
 *   boundary-abort partial). Total accounting holds:
 *   `removed.length + failed.length === requested.length`.
 * - `'stalled'` — the store's per-batch stall watchdog tripped. `removed` is
 *   whatever the executor confirmed before the trip (FR-003 — **never** forced
 *   to `[]`); `failed` is the remainder.
 * - `'executor-failed'` — the executor rejected with a whole-operation fault.
 *   `removed` is empty; `failed` carries the real RemoveSet refs (never
 *   synthesised from a collection URI).
 * - `'compute-failed'` — `computeRemoveSet` threw before any host call (FR-009).
 *   `removed: []`, `failed: []`, no fabricated `TrackRef`, count truthfully 0.
 */
export type RemovalOutcomeProvenance =
  | 'host'
  | 'stalled'
  | 'executor-failed'
  | 'compute-failed';

/**
 * Per-collection result of a removal attempt (FR-010 / AS-8). Partitions the
 * requested tracks into those the host confirmed deleted and those that
 * failed (with a host-supplied reason), so the UI can keep the unremoved
 * copies visible.
 *
 * Invariants:
 * - `removed.length + failed.length === requested.length` (the `RemoveSet`
 *   that produced this outcome) — every requested track is accounted for —
 *   for the `'host'` and `'executor-failed'` provenances. A `'stalled'`
 *   partial accounts only what the executor confirmed before the trip; a
 *   `'compute-failed'` outcome accounts nothing (both partitions empty).
 * - `removed` and `failed` are disjoint by `TrackRef` identity (playlist →
 *   `uid`, Liked Songs → `uri`); no track appears in both.
 *
 * `reason` strings on `failed[]` are human-readable diagnostics only — no
 * layer derives control flow from them (use `provenance` — NFR-004).
 */
export type RemovalOutcome = {
  /** Tracks the host confirmed deleted. */
  removed: ReadonlyArray<TrackRef>;
  /** Tracks that could not be deleted, each with a host-supplied reason. */
  failed: ReadonlyArray<{ track: TrackRef; reason: string }>;
  /**
   * Typed provenance replacing the `stalled:` / `executor-failed:` `reason`
   * string prefix (NFR-004 / ADR-0020). See {@link RemovalOutcomeProvenance}.
   */
  provenance: RemovalOutcomeProvenance;
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
