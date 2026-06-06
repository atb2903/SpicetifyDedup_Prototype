# Phase 0 Research: Duplicate Track Detection

**Mission**: `duplicate-track-detection-01KTFH5H` · **Date**: 2026-06-06 · **Plan**: [`plan.md`](./plan.md)

This file resolves every open unknown identified in plan.md §Phase 0 before Phase 1 design begins. Each item carries an explicit **Decision**, **Rationale**, and **Alternatives considered**. Decisions are load-bearing; if a future correction is needed it lands as an ADR amendment, not a silent edit here.

---

## R-001 — Architectural pattern reuse

**Decision**: Continue the **hexagonal / ports-and-adapters** pattern declared in [`ADR-0001`](../../.claude/adr/0001-hexagonal-load-dedupable-playlists.md). New code lives in the existing folder grid (`src/domain/`, `src/ports/`, `src/adapters/`, `src/store/`, `src/ui/`). `test/architecture.test.ts` already enforces the import graph.

**Rationale**:
- The repo's pattern is established, tested, and zero-friction to extend.
- The detection algorithm's purity requirement (NFR-002) lands naturally in `src/domain/` where the architecture test already forbids React, Zustand, adapter, store, and UI imports.
- The port surface mirrors the existing `PlaylistsLoader` pattern, which keeps test affordances (`Fake*` implementations) consistent across the codebase.

**Alternatives considered**:
- *Free-form layout* — rejected by charter (named pattern required, `DIRECTIVE_001`).
- *Move domain logic under a new top-level `dedup/` folder* — rejected; fragments the import-graph rules and would require extending `test/architecture.test.ts` for no architectural benefit. The mission's modules are first-class members of the existing layers.

---

## R-002 — Per-row detection-state placement

**Decision**: Separate `src/store/detection-store.ts` (vanilla Zustand) alongside the existing `playlists-store.ts`, keyed by canonical collection URI. ADR-0006 captures the decision.

**Rationale**:
- Strict file-level SRP (charter Quality Gates): load-state FSM and detection FSM are unrelated concerns.
- Symmetric reset behavior: each store owns its own `reset` action; `RouteResetContext` calls both, no leakage.
- Cleaner store invariants — page-level FSM transitions never have to consider per-row scan state, and vice versa.
- Selector composition for the UI is straightforward via React-bound hooks; no perceived ergonomic cost.

**Alternatives considered**:
- *Extend `playlists-store.ts` with a `detection: Record<canonicalUri, DetectionState>` field plus `scanCollection` / `cancelScan` actions* — single source of truth per page, but couples two unrelated FSMs in one file, conflicts with strict SRP, and complicates `RouteResetContext` wiring. Rejected by user choice in planning interrogation.

---

## R-003 — Cancellation primitive

**Decision**: `AbortSignal` is the single cancellation primitive across `TracksEnumerator`, `CatalogEnricher`, and `DetectionScanner`. ADR-0007 captures the decision.

**Rationale**:
- Native to the JS platform; no extra dependency.
- Pairs natively with `Spicetify.CosmosAsync` and any future `fetch`-based adapter — passing `{ signal }` propagates cancellation through the host call.
- Single mechanism for both *re-trigger* (FR-011) and *route-reset* (FR-012). `cancelScan(uri)` and `reset()` both call `abort()` on the same per-row `AbortController`.
- During a `Retry-After` wait, the enricher races a `setTimeout` Promise against `signal.aborted` (via a one-shot `'abort'` event listener), so cancellation during rate-limit backoff is prompt.

**Alternatives considered**:
- *Scan-id "stale-result" check* — simpler store invariants but does not stop network work. A superseded scan keeps issuing `GET /v1/tracks?ids=…` requests until they complete; on a 20k-track library that's hundreds of wasted requests after a route-reset. Rejected.
- *Both AbortSignal + stale-id guard (defense in depth)* — useful only if a store mutation could outrace its `abort()`. With AbortSignal checks at every batch boundary and the scanner's `try { … } catch (e) { if (signal.aborted) return; … }` guard, the race is closed without a second mechanism. Kept as a possible future hardening, not in scope.

**Cancellation semantics (precise)**:
- Each call to `scanCollection(uri)` allocates a fresh `AbortController`.
- If a scan is in flight on `uri` when `scanCollection(uri)` is invoked again, the prior controller's `abort()` is called *before* the state transitions to `scanning` with the new controller's signal — so the row is never observed mid-transition with two live signals.
- `reset()` walks every tracked controller, calls `abort()`, then clears the per-row map.
- The scanner observes `signal.aborted` at every await boundary (after enumeration page completes, after each enrichment batch completes, before and after the `Retry-After` sleep). On abort, the scanner throws an `AbortError`; the store catches it and does *not* dispatch `failed` — it leaves the row in whatever state `cancelScan` / `reset` already set.

---

## R-004 — Progress signal shape

**Decision**: `ProgressEvent = { stage: 'enumerating' | 'enriching' | 'matching'; processed: number; total: number | null }`. The scan port accepts an `onProgress(event: ProgressEvent) => void` callback alongside `AbortSignal`. The store reflects the latest event into `DetectionState.scanning`. ADR-0008 captures the decision.

**Rationale**:
- NFR-006 requires the scanning state to be distinguishable from idle / loaded — but "at minimum" leaves room for more, and the spec's success criteria (SC-001, SC-007) and AS-7's "remains in scanning state" during 429 backoff favor a richer signal so users on large libraries can tell the scan is alive.
- Stage labels segment the perceived progress (enumeration is fast but unbounded ahead-of-time; enrichment is N/50 batches; matching is in-memory and effectively instant).
- `processed` and `total` (nullable during enumeration where the host call returns `totalLength` per page but we only learn it on the first page) make the UI count-display straightforward.
- One callback per scan keeps the port surface small. No event bus, no observable abstraction.

**Alternatives considered**:
- *Binary scanning state (`kind: 'scanning'` only)* — smallest port surface, but on a 20k-track library the user has no signal that the scan is progressing through enrichment vs stuck on a `Retry-After` wait. Rejected by user choice.
- *Stage-labeled only (no counts)* — partial improvement but loses the quantitative reassurance ("Enriching 23 of 478…"). Rejected.
- *Push-based observable (RxJS / async iterable)* — overkill; adds a dependency or a generator boundary for a single subscriber. The callback satisfies the requirement.

**Emission cadence**:
- `enumerating`: one event per page (page size = 200 per data-porter convention).
- `enriching`: one event per 50-ID batch completion.
- `matching`: one event at the start, one at the end. (Matching is in-memory and finishes in milliseconds even at scale; mid-pass events are wasted churn.)

---

## R-005 — Enrichment batch concurrency

**Decision**: **Sequential** — one 50-ID catalog batch in flight per scan. `Retry-After` is parsed and slept locally inside the enricher between batches. ADR-0009 captures the decision.

**Rationale**:
- Gentlest on rate limits; no coordinated pause logic needed across multiple in-flight requests.
- Adapter stays trivial: a `for` loop over chunks of 50 IDs, awaiting each.
- The spec deliberately avoids hard wall-clock bounds (per memory `avoid-hard-time-cutoffs-in-nfrs`); slower-but-clearly-progressing is acceptable when the user has count-based progress feedback (R-004).
- Future bounded-parallel adapter is a swap, not a redesign — the port shape is identical.

**Alternatives considered**:
- *Bounded parallelism (~4 in flight)* — ~4× faster on large libraries, but requires a concurrency limiter and a coordinated `Retry-After` pause across in-flight batches. Deferred — drop-in replacement adapter possible without port changes.
- *Unbounded parallel (JMPerez upstream)* — fast on small libraries; likely to trigger sustained 429s on the 20k-track target. Explicitly rejected.

**Per-row vs across-row scheduling** (NFR-007): Each row's scan runs as an independent `Promise` chain with its own `AbortController` and its own sequential batch loop. Two scans on two different rows share host rate-limit pressure but the store does not serialize them; their progress events and result state are fully independent.

---

## R-006 — Duplicate-detection algorithm port

**Decision**: Port JMPerez `dedup/deduplicator.ts:15-57` as-is into `src/domain/duplicate-detector.ts`. Required per-track fields: `id`, `name`, first-artist `name`, `duration_ms`. Duration tolerance is **2000 ms inclusive** (a difference of exactly 2000 ms = duplicate; 2001 ms = not duplicate).

**Rationale**:
- A-002 pins this — no heuristic divergence (artist count, punctuation normalization, etc.) in scope.
- The algorithm is small (~30 LOC) and trivially testable in pure TypeScript.
- Keeping behavior identical to upstream means existing upstream users transitioning to the Spicetify version see the same matches.

**Boundary cases (NFR-003)** to lock in tests:
- Duration delta = 1999 ms → duplicate
- Duration delta = 2000 ms → duplicate (boundary, inclusive)
- Duration delta = 2001 ms → not duplicate

**Algorithm shape**:
```ts
// pseudocode
function detect(tracks: EnrichedTrack[]): DuplicateGroup[] {
  const seenById = new Map<canonicalUri, GroupBuilder>();
  const seenByKey = new Map<DuplicateKey, Array<{ durationMs: number; group: GroupBuilder }>>();
  for (const t of tracks) {
    // Rule 1: canonical-URI equality
    const byId = seenById.get(t.canonicalUri);
    if (byId) { byId.add(t); continue; }
    // Rule 2: name + first-artist + duration tolerance
    const key = composeKey(t.name, t.artists[0].name);
    const bucket = seenByKey.get(key) ?? [];
    const match = bucket.find(e => Math.abs(e.durationMs - t.durationMs) <= 2000);
    if (match) { match.group.add(t); continue; }
    // Otherwise: start a new group (singleton — filtered later)
    const group = newGroup(t);
    seenById.set(t.canonicalUri, group);
    bucket.push({ durationMs: t.durationMs, group });
    seenByKey.set(key, bucket);
  }
  return [...allGroups].filter(g => g.members.length >= 2)
                      .map(toDuplicateGroup);   // tags defaultKeep on member[0]
}
```

**Alternatives considered**:
- *Stronger normalization* (strip "(Live)", "(Remastered)", featuring credits) — out of scope per A-002 / OOS-7.
- *Artist-set matching* (compare unordered artist sets, not just first artist) — out of scope per OOS-7.

---

## R-007 — `Spicetify.Platform` enumeration APIs

**Decision**: Liked Songs and playlists use the same `LibraryAPI`/`PlaylistAPI` family `Prog-Jacob/spicetify-apps` `data-porter` uses.

| Collection | API | Shape per page |
|---|---|---|
| Liked Songs | `Spicetify.Platform.LibraryAPI.getTracks({ limit, offset })` | `{ items: LibraryTrackItem[]; totalLength; offset; limit }` |
| Playlist | `Spicetify.Platform.PlaylistAPI.getContents(uri, { limit, offset })` (capture exact signature in WP) | Analogous page shape; per-item shape mirrors LibraryTrackItem with the inline `uri`/`name`/`album`/`artists` fields |

**Per-item shape** (from data-porter's typing; confirmed against `Spicetify.URI` for ID extraction):
```ts
type LibraryTrackItem = {
  type: 'track';
  uri: string;             // spotify:track:<id> (or spotify:local:… → skipped)
  name: string;
  album: { uri: string; name: string };
  artists: { uri: string; name: string }[];
};
```

**Missing from inline shape**: `duration_ms`, `linked_from`. These come from the catalog enrichment step (R-008). The mission's `RawTrack` domain type carries only the fields the inline shape provides, plus the URI which becomes the canonical lookup key; everything else lands via enrichment.

**Pagination convention**: page size 200 (data-porter default); walk offsets until `offset + items.length >= totalLength`. No inter-page delay required for reads (empirical from data-porter, no throttling).

**Defensive shape validation**: The enumerator adapter validates each page against the `LibraryTrackItem` shape and throws `DetectionError('enumerator-failed', …, { cause })` on shape drift. The classifier predicate `isLibraryTrackItem` ships paired (NFR-008).

**Alternatives considered**:
- *`Spicetify.CosmosAsync.get('https://api.spotify.com/v1/me/tracks?limit=50&offset=…')` + walk `response.next`* — the exact endpoint that 502s for large libraries. Explicitly rejected (the whole reason this is a Spicetify extension).
- *Direct GraphQL via `Spicetify.GraphQL.Request`* — viable fallback if `LibraryAPI.getTracks` is removed in a future client version, but the operation name and persisted-query SHA aren't in `Spicetify.GraphQL.Definitions`. Deferred to a contingency mission (not now).

---

## R-008 — Catalog enrichment endpoint

**Decision**: `Spicetify.CosmosAsync.get('https://api.spotify.com/v1/tracks?ids=' + chunkOf50.join(','))`. Up to 50 IDs per request. Response: `{ tracks: (FullTrack | null)[] }` aligned to the input order. Sequential batching per R-005.

**Per-item response shape** (only the fields the algorithm uses):
```ts
type CatalogTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  duration_ms: number;
  linked_from?: { uri: string; id: string };
  uri: string;
};
```

**Why CosmosAsync**: auto-attaches the bearer token and cookies; correct for any `api.spotify.com/v1/*` call. *Not* safe for non-Spotify hosts (would leak the token), but every URL we hit here is Spotify-hosted.

**`null` array slots**: the catalog returns `null` for an unknown or removed track ID. The enricher emits an `unenriched` marker for each `null` and the result's `unenrichedCount` increments accordingly. Unenriched tracks cannot participate in the duration-tolerance rule (no `duration_ms`) — they're excluded from groups (FR-006 holds: every track in a group is enriched).

**Rate-limit handling**: CosmosAsync returns a `429` body as a *resolved* value (not a thrown error — see Spicetify ecosystem research), but the underlying error shape can vary. The adapter inspects the response shape:
- Success: `tracks: CatalogTrack[]` present → continue.
- 429: response object carries a `status === 429` and a `headers['Retry-After']`. Parse the seconds, sleep `Retry-After * 1000` ms (with abort race), then re-issue the same batch. If the header is missing or unparseable → throw `DetectionError('rate-limit-unparseable', …)`.
- 401: response body matches "The access token expired" → throw `DetectionError('auth-token-expired', …)`.
- 5xx / network: throw `DetectionError('network-failure', …, { cause })`.
- Shape drift on success body: throw `DetectionError('catalog-rejected', …)` — meaning the host returned 200 but the shape wasn't a `CatalogTrack[]`.

**Boundary cases (NFR-003 batch-size axis)** to lock in tests:
- 49 IDs → 1 batch
- 50 IDs → 1 batch (boundary; max per request)
- 51 IDs → 2 batches (50 + 1)
- Plus: empty collection (0 IDs → 0 batches)
- Plus: collection of all-local tracks (0 catalog IDs → 0 batches)

**Alternatives considered**:
- *raw `fetch`* — not safe; would not attach the bearer token. Rejected.
- *`/v1/tracks/{id}` single-ID endpoint, dispatched in parallel* — wasteful (50× the requests for the same data) and adds parallelism complexity. Rejected.

---

## R-009 — `Retry-After` parsing

**Decision**: Parser lives in `src/adapters/retry-after.ts`, a small standalone module: `parseRetryAfter(headerValue: string | undefined): number`. Throws `RetryAfterParseError` on malformed input; ships paired `isRetryAfterParseError` classifier predicate (per charter Input Validation).

**Rationale**:
- One responsibility per file (strict file-level SRP).
- Test-isolation: parser is exhaustively tested on boundary values (`undefined`, `''`, `'0'`, `'0.5'`, `'1'`, `'3600'`, `'-1'`, `'abc'`, `'Mon, 06 Jun 2026 12:00:00 GMT'`) without touching CosmosAsync or any host.
- Reused if a future adapter (e.g. `LibraryAPI.remove` in the deletion mission) needs the same parsing.

**Supported header forms**:
- Integer seconds (`'0'` through `'86400'`) → `value * 1000` ms.
- Fractional seconds (`'0.5'`) → `value * 1000` ms (rounded up to nearest ms).
- HTTP-date form (RFC 7231 `IMF-fixdate`) → compute `parsedDate - Date.now()` (clamped to ≥ 0). Used if Spotify ever switches; not observed in practice today.
- `undefined` / `''` / non-numeric non-date → throw.

**Boundary cases**:
- `'0'` → 0 ms (don't wait, retry immediately).
- Negative or NaN → throw `RetryAfterParseError` so the adapter can surface `rate-limit-unparseable`.

---

## R-010 — Cancellation during `Retry-After` sleep

**Decision**: The enricher implements an abort-aware sleep:

```ts
async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
```

**Rationale**: A naked `await new Promise(r => setTimeout(r, ms))` would block cancellation for up to `ms` ms. The pattern above resolves immediately on `abort()`, so a route-reset during a 60-second `Retry-After` wait still tears down the scan promptly.

**Test obligations**: explicit cases for (a) abort before the sleep starts, (b) abort during the sleep, (c) sleep completes without abort. All cases must terminate the returned promise within a microtask budget after abort.

---

## R-011 — Error taxonomy

**Decision**: Single `DetectionError` class in `src/domain/detection-errors.ts` mirroring the `PlaylistsLoaderError` pattern, with a discriminator `reason`:

```ts
type DetectionErrorReason =
  | 'auth-token-expired'           // 401 from CosmosAsync, message matches "expired"
  | 'rate-limit-unparseable'       // 429 with missing/malformed Retry-After
  | 'network-failure'              // host unreachable / 5xx / fetch threw
  | 'malformed-enrichment-payload' // host returned 200 + non-conforming shape
  | 'enumerator-failed'            // LibraryAPI/PlaylistAPI threw or returned non-page shape
  | 'catalog-rejected'             // 4xx other than 401/429 from the catalog endpoint
  | 'aborted';                     // signal.aborted while a host call was in flight
```

`aborted` is special — the store catches it and does *not* transition `failed`; it's a signal that the scan was canceled, not that it failed (FR-011 / FR-012). All other reasons drive the row to `failed`.

Paired classifier predicate: `isDetectionError(x): x is DetectionError` (NFR-008).

**Rationale**:
- Mirrors the existing `PlaylistsLoaderError` pattern — UI already knows how to render a typed error.
- Single class with a discriminator keeps the surface narrow.
- `aborted` is in the taxonomy so callers can branch on it programmatically rather than checking `error.name === 'AbortError'` indirection.

**Alternatives considered**:
- *Separate class per reason* — explosion of types for no behavioral gain.
- *Re-use `PlaylistsLoaderError`* — its `reason` enum is already locked to the load-page concerns; widening it would couple two missions' error surfaces in one type.

---

## R-012 — Region-relinked handling

**Decision**: After enrichment, the canonical URI is `linked_from.uri` when present, else the track's own `uri`. This `canonicalUri` is what the algorithm's "same ID" rule (FR-004) compares.

**Rationale**: Aligns with upstream and with how the official Spotify client treats region-relinking — the relinked-from ID is the user-meaningful identity.

**Edge case**: a collection that contains both the region-relinked stub AND its canonical counterpart will see them collapse into one `DuplicateGroup`, which is exactly the spec's intent (AS-4).

---

## R-013 — Local-file handling

**Decision**: Tracks whose URI starts with `spotify:local:` are filtered out at enumeration time (before enrichment is even attempted). Each such track increments `result.skippedLocalCount`. They never appear in any `DuplicateGroup`.

**Rationale**: Local files have no catalog entry — enrichment would return `null` for them and waste a request. They also can't be cross-correlated against catalog tracks (no shared `id`, no canonical URI). Fuzzy local-vs-catalog matching is OOS (OOS-6).

**Edge case** (AS-3): empty `result.groups`, `result.skippedLocalCount = N` when all `N` tracks are local. UI shows "No duplicates found" plus the skip count if non-zero.

---

## R-014 — Where TDD boundary tests live

**Decision**: One `*.test.ts` per `src/` module (mirrors existing convention). Boundary cases live with the module they exercise:

| Module | Boundary axis | Cases |
|---|---|---|
| `duplicate-detector.test.ts` | Duration tolerance | 1999 / 2000 / 2001 ms |
| `spicetify-catalog-enricher.test.ts` | Batch size | 0 / 49 / 50 / 51 / 100 IDs |
| `retry-after.test.ts` | Header value | undefined, '', '0', '0.5', '-1', '3600', 'abc', RFC-7231 date |
| `detection-store.test.ts` | Row count | 0 / 1 / 2 concurrent rows |
| `enriched-track-parser.test.ts` | Required-field presence | missing id / missing name / missing artists / missing duration_ms / empty artists array |

A separate `test/integration/detection-end-to-end.test.ts` exercises the row-click-through-to-result path via fake adapters, verifying the contracts in `contracts/` from the outside (DIRECTIVE_036).

---

## Resolved unknowns going forward

Every NEEDS CLARIFICATION raised in plan.md §Technical Context closes here. Phase 1 begins with no open clarifications.

## Sources

- `JMPerez/spotify-dedup` `dedup/deduplicator.ts:15-57` — algorithm
- `Prog-Jacob/spicetify-apps` `data-porter` — `LibraryAPI.getTracks` usage pattern, no inter-page delay
- `.claude/spicetify-dedup-research.md` — 502 issue, catalog endpoint, rate-limit semantics, region-relink semantics, local files
- `.claude/spicetify-ecosystem-research.md` — `Spicetify.Platform.*` surface, `CosmosAsync` safety, defensive patterns
- `.claude/adr/0001-hexagonal-load-dedupable-playlists.md` — pattern reuse
- `.claude/adr/0002-spicetify-platform-apis-over-graphql.md` — Platform-API preference
- `.claude/adr/0003-zustand-for-load-state.md` — store framework continuity
- `.claude/adr/0005-react-lifecycle-reset.md` — reset-on-route-leave precedent extended to detection-store
- Spec `FR-001`..`FR-013`, `NFR-001`..`NFR-010`, `C-001`..`C-009`, `A-001`..`A-006`
