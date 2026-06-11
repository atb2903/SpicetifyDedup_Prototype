/**
 * Pure data types for the duplicate-track detection pipeline.
 *
 * Every shape the algorithm, ports, store, and UI reference lives here.
 * No imports outside `src/domain/`; no runtime values — this is a
 * types-only module (zero JS output, coverage tooling reports 0/0 which
 * is expected per the WP01 test strategy).
 *
 * Type placement reference: data-model.md §10.
 */

// ── §1.1 — RawTrack ──────────────────────────────────────────────────────────

/**
 * The enumeration output: one record per non-local track returned by
 * `Spicetify.Platform.LibraryAPI.getTracks` (or the playlist-API
 * equivalent). Local files (`spotify:local:…`) are filtered **before**
 * construction so this type never carries them.
 *
 * Fields that the dedup algorithm does *not* use directly (`album`) are
 * kept here for future UI use and to mirror the shape returned by the API.
 */
export type RawTrack = {
  /** Spotify track URI (`spotify:track:<id>`). Never `spotify:local:…`. */
  uri: string;
  /**
   * Track ID — the suffix after `spotify:track:`. Extracted by the adapter
   * for convenience; equals `uri.split(':')[2]`. Non-empty.
   */
  id: string;
  /**
   * Display name as the Spotify host returned it. May include suffixes like
   * `(Live)` or `(Remastered)`; the algorithm normalizes these downstream.
   */
  name: string;
  /**
   * Non-empty array of artists on this track. The first entry's `name` is
   * the one used for the name+artist match (FR-005).
   * Each entry also carries the artist's URI for potential future deep-link use.
   */
  artists: ReadonlyArray<{ uri: string; name: string }>;
  /**
   * Inline album reference. Carried for future UI use; not consumed by the
   * dedup algorithm itself.
   */
  album: { uri: string; name: string };
  /**
   * Zero-based index of this track in the collection's iteration order.
   * Stable across pages within a single scan. Drives FR-007 (`defaultKeep`
   * is the member with the lowest `position` in each group).
   */
  position: number;
};

// ── §1.2 — EnrichedTrack ─────────────────────────────────────────────────────

/**
 * The output of the `CatalogEnricher` for a single `RawTrack`. Carries all
 * fields the dedup algorithm requires (`canonicalUri`, `durationMs`,
 * `artists[0].name`) that are not reliably present on the enumeration output.
 *
 * Produced by `enriched-track-parser.ts` which fails loud
 * (`DetectionError('malformed-enrichment-payload', …)`) on non-conforming
 * catalog responses (NFR-008).
 */
export type EnrichedTrack = {
  /** Mirrors `RawTrack.position`. Preserved unchanged through enrichment. */
  position: number;
  /**
   * Track URI before any region-relink resolution. Same as `RawTrack.uri`
   * in the common case; may differ from `canonicalUri` for relinked tracks.
   */
  uri: string;
  /**
   * Canonical URI: `linked_from.uri` from the catalog response when present,
   * otherwise the track's own `uri`. Used by the same-canonical-URI rule
   * (FR-004) to collapse region-relinked duplicates into a single group.
   */
  canonicalUri: string;
  /**
   * Display name. Normally identical to `RawTrack.name`; may differ if the
   * catalog corrects metadata (rare edge case).
   */
  name: string;
  /**
   * Non-empty array of artists. Only the first entry's `name` is used by
   * the name+artist match (FR-005); the array is kept as `ReadonlyArray` to
   * prevent accidental mutation downstream.
   */
  artists: ReadonlyArray<{ name: string }>;
  /**
   * Track duration in milliseconds (integer ≥ 0). Required by the
   * duration-tolerance rule (FR-005): two tracks are considered duplicates
   * when their durations differ by ≤ 2000 ms.
   */
  durationMs: number;
};

// ── §3.1 — DuplicateGroup ────────────────────────────────────────────────────

/**
 * A finalized group of duplicate tracks produced by the dedup algorithm.
 * Groups always contain at least two members; singletons are excluded from
 * the result (FR-006).
 *
 * Members are ordered ascending by `EnrichedTrack.position` so the
 * `defaultKeepIndex === 0` invariant implements FR-007 ("keep the earliest
 * by iteration order").
 */
export type DuplicateGroup = {
  /**
   * Opaque identifier that is distinct per scan but not stable across scans.
   * Intended as a React `key` in the next mission's review UI.
   */
  id: string;
  /**
   * Why these tracks were grouped together.
   * - `'same-canonical-uri'` — all members share the same `canonicalUri`
   *   (identical track, possibly relinked across regions). Near-zero false
   *   positive rate.
   * - `'name-artist-duration'` — members share a normalized `name + first-artist`
   *   key AND every pair's `|durationMs − peer.durationMs| ≤ 2000`. The
   *   heuristic that can surface covers and live versions as false positives.
   */
  reason: 'same-canonical-uri' | 'name-artist-duration';
  /**
   * Ordered list (ascending by `EnrichedTrack.position`) of the tracks in
   * this group. Always length ≥ 2.
   */
  members: ReadonlyArray<EnrichedTrack>;
  /**
   * Index into `members` identifying the track the UI pre-selects to keep.
   * Always `0` per FR-007 (earliest by iteration order). Exposed as a
   * positional index rather than a reference so the "override keep" UI
   * action can be a positional dispatch without mutating the group object.
   */
  defaultKeepIndex: number;
};

// ── §3.2 — DetectionResult ───────────────────────────────────────────────────

/**
 * The full per-collection payload exposed by the store when a row reaches
 * the `loaded` state. Contains the duplicate groups and convenience counts
 * that the UI surfaces directly (AS-2).
 */
export type DetectionResult = {
  /**
   * Canonical key for the scanned collection:
   * - Liked Songs: the sentinel string `'liked-songs'`.
   * - Playlist: the playlist's Spotify URI.
   */
  collectionKey: string;
  /**
   * UTC milliseconds (`Date.now()`) recorded when the scan completed.
   * Diagnostic; not load-bearing for any invariant.
   */
  completedAt: number;
  /**
   * All duplicate groups in the order they were finalized
   * (ascending by first-member `position`). Empty array when no duplicates
   * were found (AS-1).
   */
  groups: ReadonlyArray<DuplicateGroup>;
  /**
   * Total number of tracks across all groups (sum of `members.length`).
   * Convenience field derived from `groups`; equals
   * `groups.reduce((s, g) => s + g.members.length, 0)`.
   */
  duplicateTrackCount: number;
  /**
   * Tracks-to-remove if keeping exactly one per group.
   * Equals `duplicateTrackCount − groups.length`. Surfaced directly in AS-2.
   */
  removableTrackCount: number;
  /**
   * Count of `spotify:local:…` URIs filtered out before enrichment.
   * Surfaces in AS-3 so users understand why their track count may differ
   * from the library size.
   */
  skippedLocalCount: number;
  /**
   * Count of tracks for which the catalog returned `null` (removed from the
   * Spotify catalog). These are not enriched and are excluded from duplicate
   * matching.
   */
  unenrichedCount: number;
  /**
   * Total number of non-local tracks the enumerator yielded. Used for
   * sanity-checks and future telemetry; equals the input size to the
   * enrichment pass.
   */
  scannedTrackCount: number;
};

// ── §4.1 — ProgressEvent ─────────────────────────────────────────────────────

/**
 * A discriminated union representing the scan's current progress stage.
 *
 * Three variants, one per pipeline stage:
 * - `enumerating` — paging through the collection. `total` is `null` until
 *   the first page returns a `totalLength` from the host.
 * - `enriching` — fetching catalog data in batches of up to 50 IDs.
 *   `total` is set once enumeration completes and is held constant.
 * - `matching` — running the in-memory dedup algorithm. Emits exactly two
 *   events per scan (start: `processed=0`, end: `processed=total`).
 */
export type ProgressEvent =
  | { stage: 'enumerating'; processed: number; total: number | null }
  | { stage: 'enriching'; processed: number; total: number }
  | { stage: 'matching'; processed: number; total: number };

// ── §8 — ScanRequest ─────────────────────────────────────────────────────────

/**
 * Per-scan dispatch payload. The UI supplies this when the dedup button is
 * clicked because Liked Songs and playlist rows require different enumerator
 * parameters downstream.
 *
 * Discriminated by `kind`:
 * - `'liked-songs'` — scan the user's Liked Songs library.
 * - `'playlist'` — scan a specific playlist identified by `playlistUri`.
 */
export type ScanRequest =
  | { kind: 'liked-songs' }
  | { kind: 'playlist'; playlistUri: string };
