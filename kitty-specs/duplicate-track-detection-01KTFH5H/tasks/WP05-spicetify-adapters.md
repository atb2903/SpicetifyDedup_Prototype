---
work_package_id: WP05
title: 'Spicetify Adapters: Tracks Enumerator & Catalog Enricher'
dependencies:
- WP02
- WP03
requirement_refs:
- FR-001
- FR-002
- FR-003
- NFR-004
- NFR-008
- NFR-009
- NFR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning base and merge target are both `main`. Execution worktree/branch are assigned by `finalize-tasks`; enter the assigned workspace before editing. Final merge target is `main`.
subtasks:
- T014
- T015
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/adapters/
execution_mode: code_change
owned_files:
- src/adapters/spicetify-tracks-enumerator.ts
- src/adapters/spicetify-catalog-enricher.ts
- test/adapters/spicetify-tracks-enumerator.test.ts
- test/adapters/spicetify-catalog-enricher.test.ts
tags: []
---

# WP05 — Spicetify Adapters

## Objective

Land the two production adapters that bind detection ports to the Spicetify Platform globals:

1. `SpicetifyTracksEnumerator` — `Spicetify.Platform.LibraryAPI.getTracks` (Liked Songs) and `Spicetify.Platform.PlaylistAPI.getContents` (playlists), with pagination, local-file filtering, host-shape validation, abort plumbing, and error classification.
2. `SpicetifyCatalogEnricher` — `Spicetify.CosmosAsync.get('https://api.spotify.com/v1/tracks?ids=…')` with sequential 50-ID batching, Retry-After honoring (via the WP03 parser), abort-aware sleep, and the full CosmosAsync silent-error classification.

This is a **heavy** WP — two substantial adapter files with dense boundary-test surfaces. Both files include their own fail-loud parser + classifier pair where they validate host shapes (NFR-008).

## Context

After this WP, WP08's `app.tsx` wiring can construct the production stack: `new SpicetifyTracksEnumerator()` + `new SpicetifyCatalogEnricher()` + `createDetectionScanner(...)` → `createDetectionStore(...)`.

Read first:
- [`../contracts/tracks-enumerator-port.md`](../contracts/tracks-enumerator-port.md) — the full enumerator contract.
- [`../contracts/catalog-enricher-port.md`](../contracts/catalog-enricher-port.md) — the full enricher contract, including the CosmosAsync silent-error quirk classification.
- [`../research.md`](../research.md) §§R-007, R-008, R-010 — host APIs, catalog endpoint, abort-aware sleep.
- `src/adapters/spicetify-playlists-loader.ts` (existing) — the pattern for host-bound adapters in this repo.
- `src/types/spicetify-platform.d.ts` (existing types for `Spicetify.Platform.*`).
- `.claude/spicetify-dedup-research.md` and `.claude/spicetify-ecosystem-research.md` — the load-bearing host context.

Architectural constraints: `src/adapters/` may import from `src/domain/` + `src/ports/` + sibling `src/adapters/` files only (e.g. `retry-after.ts` from WP03). No imports from `src/store/` or `src/ui/`.

## Branch strategy

Planning base & merge target: **`main`**. Depends on WP02 (enriched-track parser) + WP03 (port interfaces + retry-after parser). Lanes alongside WP04 — both depend only on WP02 + WP03 and touch different files in `src/adapters/`.

## Subtasks

### T014 — `SpicetifyTracksEnumerator` (`src/adapters/spicetify-tracks-enumerator.ts`)

**Purpose**: Production implementation of the `TracksEnumerator` port. Paginates Liked Songs and playlists via the music client's `Platform` APIs.

**Signature**:
```ts
export class SpicetifyTracksEnumerator implements TracksEnumerator {
  constructor(platform?: Spicetify.Platform);  // Default: globalThis.Spicetify.Platform
  enumerate(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<RawTrack>>;
}

export function isLibraryTrackItem(x: unknown): x is LibraryTrackItem;
export function parseLibraryTrackItem(x: unknown, indexInPage: number): LibraryTrackItem;
```

**Algorithm**:
1. **Precheck** (synchronous, before any host call):
   - If `request.kind === 'playlist'` and `playlistUri` is empty / not a `spotify:playlist:` URI → throw `DetectionError('enumerator-failed', …, { context: { phase: 'precheck', playlistUri } })`.
2. **Initial abort check**: `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
3. **Page loop** with `pageSize = 200`, `offset = 0`:
   - If `request.kind === 'liked-songs'`: `page = await platform.LibraryAPI.getTracks({ limit: pageSize, offset });`
   - If `request.kind === 'playlist'`: `page = await platform.PlaylistAPI.getContents(request.playlistUri, { limit: pageSize, offset });`
   - Wrap the `await` in try/catch:
     - Catch where message/body matches `/access token expired/i` → throw `DetectionError('auth-token-expired')`.
     - Any other thrown error → throw `DetectionError('enumerator-failed', …, { cause, context: { phase: 'paging', offset, limit: pageSize } })`.
   - Validate `page` shape: `typeof page.totalLength === 'number'`, `Array.isArray(page.items)`. On failure → throw `DetectionError('enumerator-failed', …, { context: { phase: 'validating', offset, sampleKeys: Object.keys(page) } })`.
   - For each `item` in `page.items`:
     - `parseLibraryTrackItem(item, indexInPage)` — throws `DetectionError('enumerator-failed', …, { context: { phase: 'validating-item', offset, indexInPage, missingField } })` on missing required field.
     - If `item.uri` matches `/^spotify:local:/` → skip (do not append to result).
     - Otherwise extract `id` from `uri` and append `{ uri, id, name, artists, album, position: result.length }` to the result.
   - Emit `{ stage: 'enumerating', processed: result.length, total: page.totalLength }`.
   - `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
   - Termination condition: `if (offset + page.items.length >= page.totalLength) break;`
   - Otherwise: `offset += page.items.length;` and loop.
4. Return `result` (frozen via `Object.freeze` if cheap; otherwise return as `ReadonlyArray` typed).

**Host-shape validation** (`parseLibraryTrackItem` + `isLibraryTrackItem`):
- `item.type === 'track'`.
- `typeof item.uri === 'string'` and (matches `spotify:track:` OR `spotify:local:`).
- `typeof item.name === 'string'`.
- `Array.isArray(item.artists)` and length ≥ 1.
- Each artist: `typeof artist.uri === 'string'`, `typeof artist.name === 'string'`.
- `item.album: { uri: string; name: string }`.

**Test cases** (`test/adapters/spicetify-tracks-enumerator.test.ts`) — use a stub `Platform` object passed via constructor:

| Boundary | Cases |
|---|---|
| Pagination | 0 items, 1 item, 199, **200** (exact-page boundary), 201 (two pages), 401 (three pages) |
| Local-file filter | All-local fixture → returns `[]`; mixed local + track → only track remains; `RawTrack.position` resets to the post-filter index |
| Abort | Signal aborted at entry → throws immediately, no host call; abort between pages → throws on next iteration |
| Error: precheck | `request.kind === 'playlist'` with empty `playlistUri` → throws synchronously, no host call |
| Error: host throws | `getTracks` rejects → `DetectionError('enumerator-failed')` with `cause` populated |
| Error: token expired | Host throws Error containing "access token expired" → `DetectionError('auth-token-expired')` |
| Error: shape drift | Host resolves `{ items: [], totalLength: 'not-a-number' }` → `DetectionError('enumerator-failed')` with `phase: 'validating'` |
| Error: item shape drift | Item missing `artists` → `DetectionError('enumerator-failed')` with `phase: 'validating-item'`, `missingField: 'artists'` |
| Progress events | One event per page; `total` is the host's `totalLength`; `processed` is the post-filter cumulative count |
| Playlist path | `request.kind === 'playlist'` → calls `PlaylistAPI.getContents(uri, …)`, not `LibraryAPI.getTracks` |
| `isLibraryTrackItem` | True for valid item; false for missing artists; false for non-string uri |

**Files**:
- `src/adapters/spicetify-tracks-enumerator.ts` (new, ~180 lines).
- `test/adapters/spicetify-tracks-enumerator.test.ts` (new, ~350 lines).

### T015 — `SpicetifyCatalogEnricher` (`src/adapters/spicetify-catalog-enricher.ts`)

**Purpose**: Production implementation of the `CatalogEnricher` port. Sequential 50-ID batches against `GET /v1/tracks?ids=…` via `Spicetify.CosmosAsync.get`.

**Signature**:
```ts
export class SpicetifyCatalogEnricher implements CatalogEnricher {
  constructor(cosmos?: Spicetify.CosmosAsync, now?: () => number);
  enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>>;
}

export function isCatalogTrack(x: unknown): x is CatalogTrack;
```

**Algorithm**:
1. **Empty-input invariant**: `if (tracks.length === 0) return [];`
2. **Initial abort check**.
3. Chunk `tracks` into batches of 50.
4. For each batch:
   - `if (signal.aborted) throw AbortError;`
   - Build `idsParam = chunk.map(t => t.id).join(',')`.
   - Loop (for 429 retry):
     - `try { response = await cosmos.get('https://api.spotify.com/v1/tracks?ids=' + idsParam); } catch (e) { throw DetectionError('network-failure', …, { cause: e }); }`
     - `if (signal.aborted) throw AbortError;`
     - Classify response:
       - If `response?.status === 429` (or shape indicating 429):
         - `delayMs = parseRetryAfter(response.headers?.['Retry-After'])` — throws → caught and re-thrown as `DetectionError('rate-limit-unparseable')`.
         - `await sleep(delayMs, signal);`
         - `continue` (re-issue same batch).
       - If `response?.status === 401` OR `response.error?.message` matches `/access token expired/i` OR string body matches → throw `DetectionError('auth-token-expired')`.
       - If `response?.status >= 400 && response.status < 500` → throw `DetectionError('catalog-rejected', …, { context: { status: response.status } })`.
       - If `response?.status >= 500` OR `response instanceof Error` → throw `DetectionError('network-failure', …, { cause: response })`.
       - If `response?.tracks` is `Array` → success path, break the retry loop.
       - Else → throw `DetectionError('catalog-rejected', …, { context: { status: 200, sampleKeys: Object.keys(response ?? {}) } })`.
   - Parse each slot in `response.tracks`:
     - `null` → push `{ kind: 'unenriched', position: tracks[batchStart + i].position, rawUri: tracks[batchStart + i].uri }`.
     - Object → `asEnrichedTrack(raw, position)` (throws `malformed-enrichment-payload` on failure); push `{ kind: 'enriched', track }`.
   - Emit `{ stage: 'enriching', processed: result.length, total: tracks.length }`.
5. Return result.

**Abort-aware `sleep(ms, signal)`** (research §R-010 — local helper):
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

**Test cases** (`test/adapters/spicetify-catalog-enricher.test.ts`) — use a stub `CosmosAsync.get` passed via constructor:

| Boundary | Cases |
|---|---|
| Batch size | 0 IDs → 0 host calls; 1 ID → 1 batch; 49 → 1 batch; **50** → 1 batch (boundary); 51 → 2 batches (50 + 1); 100 → 2 batches |
| Retry-After | header `'0'` → no wait; `'1'` → sleeps 1000 ms via `vi.useFakeTimers()`; `'3600'` → 3.6e6 ms; missing → throws `rate-limit-unparseable`; `'abc'` → throws |
| Retry loop | 429 then 200 → batch succeeds after one wait; 429 → 429 → 200 → succeeds after two waits |
| Error: 401 | response `{ status: 401 }` → `auth-token-expired` |
| Error: 401-body | response with body matching `/access token expired/i` → `auth-token-expired` |
| Error: 403 | `{ status: 403 }` → `catalog-rejected` with `context.status === 403` |
| Error: 404 | `{ status: 404 }` → `catalog-rejected` |
| Error: 500 | `{ status: 500 }` → `network-failure` |
| Error: 503 | `{ status: 503 }` → `network-failure` |
| Error: thrown | `cosmos.get` rejects with `TypeError` → `network-failure`, `cause` populated |
| Error: 200 + bad shape | response `{ foo: 'bar' }` (no `tracks` array) → `catalog-rejected` with `context.status: 200` |
| Error: slot shape drift | response `{ tracks: [{ id: 'x' }] }` (missing fields) → `malformed-enrichment-payload` (via `asEnrichedTrack`) |
| Null slots | response `{ tracks: [null, validTrack] }` → first slot `unenriched`, second `enriched` |
| Abort | before first batch (pre-aborted) → throws immediately; between batches → throws at next iteration; during Retry-After sleep → throws within `signal.aborted` microtask |
| Progress events | one per batch completion (not per attempt); retry doesn't emit an extra event |
| Order alignment | result length === tracks length; `result[i].position === tracks[i].position` for unenriched slots |

**Files**:
- `src/adapters/spicetify-catalog-enricher.ts` (new, ~220 lines).
- `test/adapters/spicetify-catalog-enricher.test.ts` (new, ~480 lines for the boundary matrix).

## Test strategy

TDD. For both subtasks:
1. Write the boundary-test cases for one axis (e.g. batch size) first.
2. Watch them fail (no adapter code yet).
3. Implement the smallest path that makes them pass.
4. Add the next axis (e.g. error classification), repeat.

For the abort-aware sleep, `vi.useFakeTimers()` is essential — set up the fake timers, kick off the sleep, advance the timer, assert resolution. For the abort-during-sleep case, advance partial time, fire `controller.abort()`, assert rejection within the next microtask.

`Spicetify.Platform` and `Spicetify.CosmosAsync` are *not* available in the test environment by default. Both adapters accept the host via constructor so tests can inject stubs without touching `globalThis.Spicetify`.

Coverage gate: 100% line + branch on both adapter files.

## Definition of Done

- [ ] `src/adapters/spicetify-tracks-enumerator.ts` and `src/adapters/spicetify-catalog-enricher.ts` exist with JSDoc on every export.
- [ ] Host-shape validators (`isLibraryTrackItem`, `parseLibraryTrackItem`, `isCatalogTrack`) exported with paired classifiers per NFR-008.
- [ ] All boundary cases in the test tables present and passing.
- [ ] Retry-After sleep is abort-aware — explicit test cases for abort-during-sleep.
- [ ] 429 retry loop tested (single retry; multiple consecutive retries).
- [ ] CosmosAsync silent-error classification covers 401 / 4xx / 5xx / threw / bad-shape success.
- [ ] `npm run test:run` and `npm run typecheck` green; 100% line + branch on both modules.
- [ ] `test/architecture.test.ts` reports no violations.

## Risks

| Risk | Mitigation |
|---|---|
| `Spicetify.Platform.PlaylistAPI.getContents` exact signature varies between client versions | Adapter validates page shape and falls into `enumerator-failed` on drift; live-verification (WP09) re-exercises the real host. |
| CosmosAsync sometimes resolves with the raw error body (no `status` field), sometimes with `{ error: { ... } }` | Classifier inspects both shapes; explicit test cases for each variant; default-to `network-failure` for unrecognized error shapes. |
| `Retry-After` sleep races abort but `setTimeout` fires before `signal.aborted` is observed by the listener | The listener is attached with `{ once: true }` before the timer; on abort, the listener clears the timer; on timeout, the timer removes the listener. Race is closed. Test case for "abort fires within 1 ms of sleep start" confirms. |
| Multi-page enumeration accidentally double-pages on terminator | Terminator is `offset + items.length >= totalLength` — strictly greater-or-equal; explicit test for exact-page boundary (200 items, totalLength 200). |
| `vi.useFakeTimers()` not restored between tests leaks fake timers into adjacent tests | `beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());` in the describe block; assert `vi.getTimerCount() === 0` at the end of relevant tests. |

## Reviewer guidance

- Confirm exact-page-boundary test (200 items, single full page) does not double-fetch.
- Confirm Retry-After integer `'0'` → no wait (no `setTimeout` registered).
- Confirm classifier predicates ship paired with throwing parsers (NFR-008).
- Confirm `RawTrack.position` is the **post-local-filter** index, not the host-original index.
- Confirm the precheck for empty/malformed `playlistUri` throws *synchronously* before any host method is called (test asserts the host stub's call count is 0).
- Spot-check the live-Spotify response shape against `.claude/spicetify-ecosystem-research.md` — the typing should match the real host's payload, not a guessed shape.

## Implementation command

```bash
spec-kitty agent action implement WP05 --agent <name>
```
