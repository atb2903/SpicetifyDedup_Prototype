# Work Packages: Duplicate Track Detection

**Mission**: `duplicate-track-detection-01KTFH5H` · **Spec**: [`spec.md`](./spec.md) · **Plan**: [`plan.md`](./plan.md)
**Planning base**: `main` · **Merge target**: `main`
**Generated**: 2026-06-07

## Scope summary

Wire the per-row dedup button on the Dedup page to a complete detection pipeline:

1. Enumerate non-local tracks in the selected collection via the music client's library/playlist APIs.
2. Enrich each track with catalog metadata (`durationMs`, region-relinked `canonicalUri`) via the catalog endpoint, batched 50 IDs per call.
3. Run the pure JMPerez detection algorithm (canonical-ID OR name+first-artist within ±2000 ms inclusive) to produce typed `DuplicateGroup[]`.
4. Surface result counts (groups + tracks-to-remove) per row through a separate `detection-store` keyed by collection URI.
5. Cancel atomically on re-trigger / route-reset via `AbortSignal`; never present a partial result.

Mutation, review UI, cross-collection matching, and persistence are **out of scope** for this mission (see spec §Out of Scope and `C-001`/`C-002`/`C-003`).

## Architectural pattern

**Hexagonal / Ports & Adapters** (continuation of ADR-0001). New files slot into the existing `src/{domain,ports,adapters,store,ui}` grid; `test/architecture.test.ts` already enforces the import graph.

## Branch strategy

`main` is both the planning base and the merge target. `finalize-tasks` will compute per-WP lanes; each lane gets exactly one worktree at implement time. Within a lane, WPs execute sequentially in dependency order.

## Subtask Index

Reference table only — see per-WP checkbox rows below for tracking.

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Detection types (`detection-types.ts`) — `RawTrack`, `EnrichedTrack`, `DuplicateGroup`, `DetectionResult`, `ProgressEvent`, `ScanRequest` | WP01 | [P] | [D] |
| T002 | Detection errors (`detection-errors.ts`) — `DetectionError`, `DetectionErrorReason`, `isDetectionError` | WP01 | [D] |
| T003 | Detection state FSM (`detection-state.ts`) — `DetectionState`, `DetectionAction`, `transition` + 20-cell test grid | WP01 |  | [D] |
| T004 | Duplicate key (`duplicate-key.ts`) — branded `DuplicateKey`, `composeKey` | WP02 | [D] |
| T005 | Enriched-track parser (`enriched-track-parser.ts`) — `asEnrichedTrack` fail-loud + `isEnrichedTrack` classifier | WP02 | [D] |
| T006 | Duplicate detector (`duplicate-detector.ts`) — `detect()` + 1999/2000/2001 ms boundary tests | WP02 |  | [D] |
| T007 | Tracks enumerator port interface (`ports/tracks-enumerator.ts`) | WP03 | [D] |
| T008 | Catalog enricher port interface (`ports/catalog-enricher.ts`) | WP03 | [D] |
| T009 | Detection scanner port interface (`ports/detection-scanner.ts`) | WP03 | [D] |
| T010 | Retry-After parser (`adapters/retry-after.ts`) — `parseRetryAfter`, `isRetryAfterParseError` + boundary tests | WP03 |  | [D] |
| T011 | `FakeTracksEnumerator` test double | WP04 | [D] |
| T012 | `FakeCatalogEnricher` test double (with force modes) | WP04 | [D] |
| T013 | Composition adapter (`adapters/detection-scanner.ts`) — `createDetectionScanner` + 9-step orchestration | WP04 |  | [D] |
| T014 | `SpicetifyTracksEnumerator` adapter — LibraryAPI / PlaylistAPI dispatch, pagination, local-file filter, abort, error classification | WP05 | [P] |
| T015 | `SpicetifyCatalogEnricher` adapter — sequential 50-ID batching, abort-aware sleep, Retry-After loop, CosmosAsync silent-error classification | WP05 | [P] |
| T016 | `detection-store.ts` — per-row state map, `AbortController` tracking, atomic-replace, reset wiring | WP06 |  |
| T017 | `DetectionStoreContext.tsx` — provider + selector hook | WP06 | [P] |
| T018 | Extend `RouteResetContext.tsx` to reset both stores | WP06 | [P] |
| T019 | Integration test (`test/integration/detection-end-to-end.test.ts`) — full row-click-to-summary via fakes | WP06 |  |
| T020 | `ScanningView.tsx` + module.scss — stage label + counts | WP07 | [D] |
| T021 | `DetectionLoadedSummary.tsx` + module.scss — group/track counts + "No duplicates found" | WP07 | [D] |
| T022 | `DetectionFailedView.tsx` + module.scss — per-reason label table | WP07 | [D] |
| T023 | Refactor `DedupButton.tsx` — dispatch `scanCollection`, derive `disabled` from per-row scan-in-flight | WP08 |  |
| T024 | Update `PlaylistRow.tsx` + `LikedSongsRow.tsx` to render per-row detection state | WP08 |  |
| T025 | Wire production stack in `app.tsx` — Spicetify adapters → scanner → detection store → provider | WP08 |  |
| T026 | ADR-0006 — separate `detection-store` | WP09 | [D] |
| T027 | ADR-0007 — `AbortSignal` as the cancellation primitive | WP09 | [D] |
| T028 | ADR-0008 — progress signal shape (stage + counts) | WP09 | [D] |
| T029 | ADR-0009 — sequential enrichment + local Retry-After honoring | WP09 | [D] |
| T030 | Live verification — build extension, run end-to-end flow, capture screenshot | WP09 |  | [D] |

---

## WP01 — Domain Types, Errors, State FSM

**Goal**: Land the pure-data foundation the rest of the mission consumes: every type the algorithm and store reference, the typed-error taxonomy with paired classifier, and the per-row FSM with its exhaustive transition table.
**Priority**: P0 (blocking foundation).
**Estimated prompt size**: ~380 lines.
**Independent test**: `npm run test:run -- test/domain/detection-types.test.ts test/domain/detection-errors.test.ts test/domain/detection-state.test.ts` is green with 100% line+branch on every new module.

### Subtasks

- [x] T001 Detection types (`detection-types.ts`) — `RawTrack`, `EnrichedTrack`, `DuplicateGroup`, `DetectionResult`, `ProgressEvent`, `ScanRequest` (WP01)
- [x] T002 Detection errors (`detection-errors.ts`) — `DetectionError`, `DetectionErrorReason`, `isDetectionError` (WP01)
- [x] T003 Detection state FSM (`detection-state.ts`) — `DetectionState`, `DetectionAction`, `transition` + 20-cell test grid (WP01)

### Implementation sketch

1. Materialize the type definitions verbatim from [`data-model.md`](./data-model.md) §§1, 3, 4, 5, 6 into `src/domain/`. One file per concern (strict SRP).
2. Write `DetectionError` mirroring the existing `PlaylistsLoaderError` pattern in `src/domain/errors.ts`; pair with `isDetectionError` (NFR-008).
3. Write `transition(state, action)` matching §5.3's table exactly. Ignored cells return the state by reference (asserted by tests).

### Parallel opportunities

T001 and T002 are independent (`detection-errors.ts` does not depend on the type module). T003 depends on `ProgressEvent` and `DetectionResult` from T001, so T003 runs after T001.

### Dependencies

None.

### FR/NFR coverage

FR-008 (state shape), FR-011 (atomic replace transition), FR-012 (`cancel` action), NFR-005 (no partial), NFR-006 (distinguishable `scanning`), NFR-008 (typed error + classifier), NFR-010 (JSDoc).

### Risks

- Type drift between `data-model.md` and the implementation will break later WPs. **Mitigation**: copy type definitions verbatim; reviewer confirms each field against the data model.
- `DetectionState.scanning` carrying a mutable `progress` reference. **Mitigation**: state is treated as immutable; `transition` returns fresh objects on non-ignored cells.

---

## WP02 — Domain: Key, Parser, Detector

**Goal**: Land the pure detection algorithm and its trusted-input boundary parser. The 1999/2000/2001 ms duration-tolerance boundary tests live here.
**Priority**: P0 (algorithm enables every downstream WP test).
**Estimated prompt size**: ~420 lines.
**Independent test**: `npm run test:run -- test/domain/duplicate-key.test.ts test/domain/enriched-track-parser.test.ts test/domain/duplicate-detector.test.ts` green at 100% coverage.

### Subtasks

- [x] T004 Duplicate key (`duplicate-key.ts`) — branded `DuplicateKey`, `composeKey` (WP02)
- [x] T005 Enriched-track parser (`enriched-track-parser.ts`) — `asEnrichedTrack` fail-loud + `isEnrichedTrack` classifier (WP02)
- [x] T006 Duplicate detector (`duplicate-detector.ts`) — `detect()` + 1999/2000/2001 ms boundary tests (WP02)

### Implementation sketch

1. `composeKey(name, firstArtistName)` normalizes each input with `.trim().toLocaleLowerCase('en-US')` and joins via the literal NUL character (`' '`). Brand the return type as `DuplicateKey`.
2. `enriched-track-parser.ts` validates the catalog response shape per data-model §1.2: throws `DetectionError('malformed-enrichment-payload', …, { context: { missingField } })` for any missing required field, pairs with `isEnrichedTrack(x): x is EnrichedTrack`.
3. `detect(tracks: EnrichedTrack[])` implements the algorithm in research §R-006: two maps (by `canonicalUri`, by `DuplicateKey`); for each track, check canonical-URI equality first, then name+artist+duration tolerance; finalize groups with `defaultKeepIndex = 0`.

### Boundary tests

| File | Bound | Cases |
|---|---|---|
| `duplicate-detector.test.ts` | Duration tolerance | 0, 1, 1999, **2000** (inclusive), 2001 ms |
| `duplicate-detector.test.ts` | Group membership | 0, 1, 2 (smallest group), 3 (chain) |
| `duplicate-detector.test.ts` | Collection size | 0, 1, 2 no-dup, 2 dup |
| `enriched-track-parser.test.ts` | `artists` length | 0 (throws), 1 (boundary), 2+ (only first used) |
| `enriched-track-parser.test.ts` | `durationMs` | -1 (throws), 0 (accepted), 1 (accepted), non-integer (throws) |

### Parallel opportunities

T004 and T005 are independent (different files, no cross-imports). T006 imports both — it runs last.

### Dependencies

WP01 (uses `EnrichedTrack`, `DuplicateGroup`, `DetectionError`).

### FR/NFR coverage

FR-002, FR-004, FR-005, FR-006, FR-007, NFR-001, NFR-002, NFR-003, NFR-008.

### Risks

- Region-relink edge: members of a `same-canonical-uri` group must compare against `canonicalUri`, not `uri`. **Mitigation**: explicit AS-4 test case in `duplicate-detector.test.ts`.
- Pairwise transitive matching (chain `1999-1999-1999`): per data-model §3.1 invariants, every pair within a group must match — but the chain matches via the bucket-search rule (each new track matches the most-recently-added peer it can within tolerance). **Mitigation**: explicit chain test case.

---

## WP03 — Ports & Retry-After Parser

**Goal**: Define the three port interfaces consumed by adapters and the composition layer; ship the standalone `parseRetryAfter` parser + classifier with full boundary coverage.
**Priority**: P0 (port shapes are referenced by every adapter WP).
**Estimated prompt size**: ~340 lines.
**Independent test**: `npm run test:run -- test/adapters/retry-after.test.ts` green; `tsc --noEmit` green (port interfaces are type-only).

### Subtasks

- [x] T007 Tracks enumerator port interface (`ports/tracks-enumerator.ts`) (WP03)
- [x] T008 Catalog enricher port interface (`ports/catalog-enricher.ts`) (WP03)
- [x] T009 Detection scanner port interface (`ports/detection-scanner.ts`) (WP03)
- [x] T010 Retry-After parser (`adapters/retry-after.ts`) — `parseRetryAfter`, `isRetryAfterParseError` + boundary tests (WP03)

### Implementation sketch

1. Each port file declares one `interface` plus any port-local types (e.g. `EnrichmentSlot` from `catalog-enricher.ts`). Imports are restricted to `../domain/`.
2. `retry-after.ts` parses three header forms: integer seconds (`'0'` to `'86400'`), fractional seconds (`'0.5'`), and HTTP-date (RFC 7231) — clamping past-dated values to 0 ms. Negative numerics and non-parseable strings throw `RetryAfterParseError`. `isRetryAfterParseError(x): x is RetryAfterParseError` ships paired.

### Boundary tests (`retry-after.test.ts`)

| Header value | Expected |
|---|---|
| `undefined` | throws |
| `''` | throws |
| `'0'` | 0 ms |
| `'0.5'` | 500 ms |
| `'1'` | 1000 ms |
| `'3600'` | 3_600_000 ms |
| `'-1'` | throws |
| `'abc'` | throws |
| `'Mon, 06 Jun 2026 12:00:00 GMT'` (future) | future-now (≥ 0) |
| past HTTP-date | 0 ms |

### Parallel opportunities

T007, T008, T009 are independent interface files. T010 is independent of all three.

### Dependencies

WP01 (port files reference `DetectionError`, `ScanRequest`, `RawTrack`, `EnrichedTrack`, `ProgressEvent`).

### FR/NFR coverage

FR-002, FR-008, FR-010, NFR-004 (parser exact-honoring), NFR-007, NFR-008.

### Risks

- HTTP-date form rarely appears in practice but the parser must accept it per RFC 7231. **Mitigation**: test cases for past, present, and future HTTP-dates; clamp negatives.

---

## WP04 — Test Doubles & Composition Adapter

**Goal**: Land `FakeTracksEnumerator`, `FakeCatalogEnricher`, and the pure `createDetectionScanner` composition adapter. Once this WP closes, the whole detection pipeline is testable end-to-end without touching Spicetify.
**Priority**: P1 (unlocks WP05 + WP06 testing).
**Estimated prompt size**: ~440 lines.
**Independent test**: `npm run test:run -- test/adapters/fake-tracks-enumerator.test.ts test/adapters/fake-catalog-enricher.test.ts test/adapters/detection-scanner.test.ts` green at 100%.

### Subtasks

- [x] T011 `FakeTracksEnumerator` test double (WP04)
- [x] T012 `FakeCatalogEnricher` test double (with force modes) (WP04)
- [x] T013 Composition adapter (`adapters/detection-scanner.ts`) — `createDetectionScanner` + 9-step orchestration (WP04)

### Implementation sketch

1. `FakeTracksEnumerator` accepts a fixture `RawTrack[]` (or a `ScanRequest → RawTrack[]` callback) plus an optional `pageSize` so progress-event tests can dictate page boundaries. Emits one `enumerating` event per simulated page; checks `signal.aborted` between pages.
2. `FakeCatalogEnricher` accepts a `Map<trackId, EnrichedTrack | null>` plus force-mode flags: `force429Unparseable`, `forceAuthExpired`, `forceShapeDrift`. Emits one `enriching` event per batch boundary (configurable batch size for tests). Honors `AbortSignal` synchronously.
3. `createDetectionScanner(enumerator, enricher, clock = Date.now)` implements the 9-step `scan()` body from [`contracts/detection-scanner-port.md`](./contracts/detection-scanner-port.md). Captures the first non-null `total` from `enumerating` events to derive `skippedLocalCount`. Performs zero host calls.

### Black-box test cases (`detection-scanner.test.ts`)

- Empty collection → `loaded` with empty `groups`, no `enriching`/`matching` events emitted.
- 1 duplicate group across 2 tracks → result has 1 group, `duplicateTrackCount = 2`, `removableTrackCount = 1`.
- Multiple groups with mixed reasons → groups ordered by first-member position.
- Abort *before* `enumerate()` → throws `AbortError`, no port called.
- Abort *between* enumerate and enrich → enricher never called.
- Abort *during* enrich → no `matching` event emitted.
- Enumerator throws `DetectionError('enumerator-failed')` → re-thrown unchanged.
- Enricher throws `DetectionError('rate-limit-unparseable')` → re-thrown.
- Determinism: identical input → byte-equivalent `groups`.
- Clock injection: `completedAt` equals the injected clock's return value.
- Spot-check: `import` graph contains no `Spicetify.*` reference (lightweight regex on the file body).

### Parallel opportunities

T011 and T012 are independent. T013 imports both — it runs last within the WP.

### Dependencies

WP01, WP02, WP03.

### FR/NFR coverage

FR-006, FR-008, NFR-001, NFR-005, NFR-006, NFR-007.

### Risks

- `skippedLocalCount` derivation depends on the first `enumerating` event carrying a non-null `total`. If the fake's pageSize causes `total` to be observed only post-completion (e.g. small fixture, single page), the scanner must still get the value. **Mitigation**: scanner reads `total` from every event until non-null is observed; test case with single-page fixture covers this.

---

## WP05 — Spicetify Adapters

**Goal**: Production adapters that bind the enumerator and enricher ports to `Spicetify.Platform.LibraryAPI` / `PlaylistAPI` and `Spicetify.CosmosAsync`. Both files are dense — host-shape validation, abort plumbing, batching, Retry-After honoring, and the CosmosAsync silent-4xx/5xx classification all live here.
**Priority**: P1.
**Estimated prompt size**: ~480 lines (heavy WP — two substantial adapter files).
**Independent test**: `npm run test:run -- test/adapters/spicetify-tracks-enumerator.test.ts test/adapters/spicetify-catalog-enricher.test.ts` green at 100%.

### Subtasks

- [ ] T014 `SpicetifyTracksEnumerator` adapter — LibraryAPI / PlaylistAPI dispatch, pagination, local-file filter, abort, error classification (WP05)
- [ ] T015 `SpicetifyCatalogEnricher` adapter — sequential 50-ID batching, abort-aware sleep, Retry-After loop, CosmosAsync silent-error classification (WP05)

### Implementation sketch

**T014 — `spicetify-tracks-enumerator.ts`**:
1. Dispatch on `request.kind`: `liked-songs` → `Spicetify.Platform.LibraryAPI.getTracks`; `playlist` → `Spicetify.Platform.PlaylistAPI.getContents(request.playlistUri, …)`.
2. Page-walk with page size 200; check `signal.aborted` between pages.
3. Validate each page payload against the expected shape via `isLibraryTrackItem` (exported pair: `isLibraryTrackItem` + `parseLibraryTrackItem`).
4. Filter out `/^spotify:local:/` URIs before appending to the result; assign `RawTrack.position` from the post-filter index.
5. Emit one `enumerating` event per page with `processed = cumulative-post-filter` and `total = host's totalLength` (held constant after first page).
6. Error classification: shape drift → `enumerator-failed`; 401 surfaced via Platform → `auth-token-expired`; precheck failures (empty/malformed `playlistUri`) throw synchronously before any host call.

**T015 — `spicetify-catalog-enricher.ts`**:
1. Chunk input IDs into batches of 50.
2. For each batch, `await Spicetify.CosmosAsync.get('https://api.spotify.com/v1/tracks?ids=' + chunk.map(t => t.id).join(','))`.
3. Inspect the resolved value's `status` field:
   - `429` → parse `Retry-After` via `parseRetryAfter` (WP03); on parse failure throw `rate-limit-unparseable`; otherwise sleep via abort-aware helper, then re-issue the same batch.
   - `401` or body matching `/access token expired/i` → `auth-token-expired`.
   - `4xx` other → `catalog-rejected` with `context.status`.
   - `5xx` / `Error` instance / threw → `network-failure` with `{ cause }`.
4. On success, parse each slot via `asEnrichedTrack`; `null` slots → `EnrichmentSlot.unenriched` with `position` and `rawUri`; bad shape → `malformed-enrichment-payload`.
5. Check `signal.aborted` synchronously at every iteration boundary and before/after every `await`.
6. Emit one `enriching` event per batch completion (after retry success counts as one event).
7. Abort-aware `sleep(ms, signal)` helper lives in this file (private); races a `setTimeout` against an `'abort'` listener (research §R-010).

### Boundary tests

| File | Bound | Cases |
|---|---|---|
| `spicetify-tracks-enumerator.test.ts` | Pagination | 0 items, 1 item, 199, 200 (exact page), 201 (two pages), 401 (three pages); fixture mixing local + non-local |
| `spicetify-tracks-enumerator.test.ts` | Abort | before first page, between pages, on already-aborted signal |
| `spicetify-tracks-enumerator.test.ts` | Error classification | host throws, 401 surfaced, shape drift, empty playlistUri, malformed playlistUri |
| `spicetify-catalog-enricher.test.ts` | Batch size | 0 IDs (0 batches), 1, 49, 50 (single batch), 51 (2 batches), 100 (2 batches) |
| `spicetify-catalog-enricher.test.ts` | Retry-After | `'0'` (no wait), `'1'` (sleeps 1000 ms via `vi.useFakeTimers`), `'3600'` (3.6e6 ms), missing (throws `rate-limit-unparseable`), `'abc'` (throws) |
| `spicetify-catalog-enricher.test.ts` | Error classification | 401, 403, 404, 500, 503, network throw, 200 with bad shape, slot with missing fields |
| `spicetify-catalog-enricher.test.ts` | Abort | before first batch, mid-batch (resolves then throws), during Retry-After sleep, on already-aborted signal |

### Parallel opportunities

T014 and T015 are independent files; both can be implemented in parallel.

### Dependencies

WP03 (port interfaces + retry-after parser), WP02 (enriched-track parser).

### FR/NFR coverage

FR-001, FR-002, FR-003, NFR-004, NFR-008, AS-3, AS-7.

### Risks

- Spicetify `Platform.PlaylistAPI.getContents` exact signature drift between client versions. **Mitigation**: typed via `src/types/spicetify-platform.d.ts`; adapter validates page shape; shape drift surfaces as `enumerator-failed`. Re-verify against the live client during live verification (WP09).
- CosmosAsync's silent-error quirk: some 4xx responses come as resolved objects with a `status` field; others come as resolved error-shaped objects. **Mitigation**: classifier examines both shapes; explicit test cases for each.
- `Retry-After` sleep must not exceed the parsed duration. **Mitigation**: use `vi.useFakeTimers()` and assert `vi.getTimerCount()` / advance exactly the parsed ms.

---

## WP06 — Detection Store, Context, Route-Reset, Integration

**Goal**: Wire the FSM + ports into a vanilla Zustand store keyed by collection URI. Manage `AbortController`s per row, enforce atomic-replace on re-trigger, hook route-reset, and prove the whole pipeline end-to-end via an integration test driven by the real store + composition adapter + fakes.
**Priority**: P1.
**Estimated prompt size**: ~480 lines.
**Independent test**: `npm run test:run -- test/store/detection-store.test.ts test/store/DetectionStoreContext.test.tsx test/store/RouteResetContext.test.tsx test/integration/detection-end-to-end.test.ts` green at 100%.

### Subtasks

- [ ] T016 `detection-store.ts` — per-row state map, `AbortController` tracking, atomic-replace, reset wiring (WP06)
- [ ] T017 `DetectionStoreContext.tsx` — provider + selector hook (WP06)
- [ ] T018 Extend `RouteResetContext.tsx` to reset both stores (WP06)
- [ ] T019 Integration test (`test/integration/detection-end-to-end.test.ts`) — full row-click-to-summary via fakes (WP06)

### Implementation sketch

1. `createDetectionStore(scanner)` returns `StoreApi<DetectionStoreState>` (data-model §8). Internal `controllers: Record<string, AbortController>` tracks the in-flight signal per row (not part of public state — held in closure).
2. `scanCollection(key, request)`:
   - If `controllers[key]` exists → call `.abort()` (atomic-replace).
   - Allocate fresh `AbortController`; store under `controllers[key]`.
   - Dispatch `{ type: 'start' }` via `transition`.
   - `try { result = await scanner.scan(request, controller.signal, onProgress); dispatch complete } catch (e) { if AbortError → return; else dispatch fail } finally { delete controllers[key] }`.
   - `onProgress(event)` dispatches `{ type: 'progress', event }`.
3. `cancelScan(key)` aborts the row's controller and dispatches `{ type: 'cancel' }`. No-op from any non-`scanning` state.
4. `reset()` walks every controller, aborts all, clears the map, dispatches `cancel` for every `scanning` row.
5. `DetectionStoreContext.tsx` mirrors `PlaylistsStoreContext.tsx` shape: provider takes a `StoreApi<DetectionStoreState>`, exposes `useDetectionStore<T>(selector)` via React context.
6. Extend `RouteResetContext.tsx`: in addition to `usePlaylistsStore(s => s.reset)`, also call `useDetectionStore(s => s.reset)`. Both reset on mount and unmount.
7. Integration test wires `createDetectionScanner(fakeEnumerator, fakeEnricher)` + `createDetectionStore(scanner)`, mounts a minimal React shell with both providers, and exercises:
   - row click → state transitions `idle → scanning → loaded`
   - re-trigger → state stays `scanning` continuously, second result replaces first
   - cancel → returns to `idle`
   - reset → all rows reset, all controllers aborted
   - parallel rows → independent state evolution

### Test cases (`detection-store.test.ts`)

- Initial state: `rows` empty; `scanCollection` lazily inserts.
- Happy path: `idle → scanning(enumerating) → scanning(enriching) → scanning(matching) → loaded(result)`.
- Re-trigger: prior controller aborted before new `scanning` transition; row never observed as `loaded` mid-replacement.
- Cancel from `scanning`: controller aborted, row → `idle`.
- Cancel from `idle/loaded/failed`: documented no-op (no abort, no state change).
- Reset: every controller aborted, `rows` cleared.
- Parallel rows: `scanCollection('liked-songs', …)` and `scanCollection('spotify:playlist:abc', …)` run independently; aborting one does not affect the other.
- AbortError catch: scanner throwing `AbortError` does NOT dispatch `fail`.
- Non-`DetectionError` throw: wrapped as `DetectionError('catalog-rejected', …, { cause })` before `fail` dispatch.
- Late callback after cancel: scanner resolving `complete` after `cancel` is ignored by the FSM (per §5.3 transition table).

### Parallel opportunities

T016 and T017 can be parallelized within the WP (T017 only imports the store's types). T018 modifies an existing file — handle after T017. T019 imports everything else — runs last.

### Dependencies

WP01, WP02, WP03, WP04 (composition adapter is used in the integration test).

### FR/NFR coverage

FR-008, FR-010, FR-011, FR-012, FR-013, NFR-005, NFR-007, AS-9, AS-10, AS-11.

### Risks

- A late `progress` event arriving after `cancel` could dispatch into the FSM. **Mitigation**: FSM ignores `progress` from `idle` (§5.3 — return identical reference); test case asserts.
- `RouteResetContext` modification must keep `usePlaylistsStore` semantics intact. **Mitigation**: existing `RouteResetContext.test.tsx` cases stay green; new cases added for the detection-store reset path.
- Concurrent `scanCollection` invocations on the same row within a microtask. **Mitigation**: synchronous abort-then-dispatch sequence in `scanCollection` ensures the FSM never sees two concurrent `start`s; test case covers double-click within `Promise.resolve()`.

---

## WP07 — UI Views

**Goal**: Three presentational components rendering the per-row detection state: `ScanningView`, `DetectionLoadedSummary`, `DetectionFailedView`. Pure props in → JSX out; no store/port imports (enforced by architecture test).
**Priority**: P2.
**Estimated prompt size**: ~320 lines.
**Independent test**: `npm run test:run -- test/ui/ScanningView.test.tsx test/ui/DetectionLoadedSummary.test.tsx test/ui/DetectionFailedView.test.tsx` green at 100%.

### Subtasks

- [x] T020 `ScanningView.tsx` + module.scss — stage label + counts (WP07)
- [x] T021 `DetectionLoadedSummary.tsx` + module.scss — group/track counts + "No duplicates found" (WP07)
- [x] T022 `DetectionFailedView.tsx` + module.scss — per-reason label table (WP07)

### Implementation sketch

1. `ScanningView` props: `{ progress: ProgressEvent }`. Displays a stage label (`Enumerating`, `Enriching`, `Matching`) and a `processed / total` counter (or `processed` with no denominator when `total === null`). Includes ARIA `role="status"` + `aria-live="polite"` so screen readers announce stage transitions.
2. `DetectionLoadedSummary` props: `{ result: DetectionResult }`. Branches: `groups.length === 0` → renders "No duplicates found"; otherwise renders `N groups · M tracks to remove`. Surfaces `skippedLocalCount` and `unenrichedCount` as secondary annotations when non-zero.
3. `DetectionFailedView` props: `{ reason: DetectionError }`. Looks up the user-visible label from the closed table in data-model §6.1. Type-checked exhaustiveness (every `DetectionErrorReason` mapped — `never` catch in the switch).

### Test cases

| File | Cases |
|---|---|
| `ScanningView.test.tsx` | each stage renders its label; `total: null` renders no denominator; `total: 0` renders `0 / 0`; ARIA attributes present |
| `DetectionLoadedSummary.test.tsx` | empty groups → "No duplicates found"; 1 group / 2 tracks → singular/plural copy; non-zero `skippedLocalCount` annotation; non-zero `unenrichedCount` annotation; AS-1 + AS-2 wording |
| `DetectionFailedView.test.tsx` | every `DetectionErrorReason` (except `aborted` which is never rendered) renders its label; exhaustiveness compile error if a reason is missing |

### Parallel opportunities

All three subtasks are independent files — fully parallelizable.

### Dependencies

WP01 (consumes `ProgressEvent`, `DetectionResult`, `DetectionError`).

### FR/NFR coverage

FR-009, NFR-006, AS-1, AS-2, AS-8.

### Risks

- Aria-live region may double-announce on every progress event (one per page or batch). **Mitigation**: announce stage transitions only; counters update silently. Test asserts ARIA shape, not announcement cadence.
- `aborted` reason must never reach this component (store handles it before `failed`). **Mitigation**: union narrowing — the `DetectionFailedView` accepts a non-aborted reason variant if practical; otherwise asserts at runtime + tests cover the never-rendered case.

---

## WP08 — UI Wiring & Production Entry

**Goal**: Wire the existing `DedupButton` to dispatch `scanCollection`, gate its `disabled` on the per-row scan-in-flight state, render the three new views inside `PlaylistRow` and `LikedSongsRow` based on store state, and assemble the production singletons in `app.tsx`.
**Priority**: P1 (this is what users actually click).
**Estimated prompt size**: ~380 lines.
**Independent test**: `npm run test:run -- test/ui/DedupButton.test.tsx test/ui/PlaylistRow.test.tsx test/ui/LikedSongsRow.test.tsx test/app.test.tsx` green at 100%; `npm run build-local` succeeds.

### Subtasks

- [ ] T023 Refactor `DedupButton.tsx` — dispatch `scanCollection`, derive `disabled` from per-row scan-in-flight (WP08)
- [ ] T024 Update `PlaylistRow.tsx` + `LikedSongsRow.tsx` to render per-row detection state (WP08)
- [ ] T025 Wire production stack in `app.tsx` — Spicetify adapters → scanner → detection store → provider (WP08)

### Implementation sketch

1. `DedupButton`'s props change shape: now takes `{ collectionKey: string; request: ScanRequest; displayName: string }`. On click, calls `useDetectionStore(s => s.scanCollection)(collectionKey, request)`. `disabled` derives from `useDetectionStore(s => s.rows[collectionKey]?.kind === 'scanning')`. Drop the existing `logDedupClick` dependency (delete the file if it's the only consumer; otherwise leave the helper untouched).
2. `PlaylistRow` and `LikedSongsRow` read the per-row state via `useDetectionStore` and render the matching view (`ScanningView` / `DetectionLoadedSummary` / `DetectionFailedView`) alongside (or below) the existing row cells. Idle rows render no extra content. For `LikedSongsRow`, the collection key is the literal `'liked-songs'` and the request is `{ kind: 'liked-songs' }`. For `PlaylistRow`, the key is `row.key` (the playlist URI) and the request is `{ kind: 'playlist', playlistUri: row.key }`.
3. `app.tsx` constructs `new SpicetifyTracksEnumerator()`, `new SpicetifyCatalogEnricher()`, `createDetectionScanner(enumerator, enricher)`, and `createDetectionStore(scanner)`, then wraps the existing tree with `<DetectionStoreProvider store={detectionStore}>`. Provider order: `PlaylistsStoreProvider > DetectionStoreProvider > RouteResetProvider > DedupPage`. No side effects until the user clicks (per FR-010 / C-004).

### Test cases

- `DedupButton`: scan-in-flight → `disabled` true; idle/loaded/failed → enabled; click dispatches `scanCollection(collectionKey, request)`.
- `PlaylistRow`: store row in `scanning` → `<ScanningView />` mounted; `loaded` → summary; `failed` → failed view; `idle` → no extra content.
- `LikedSongsRow`: same matrix; collection key is the `'liked-songs'` sentinel.
- `app.test.tsx`: production tree renders without throwing; no `Spicetify.*` call happens before user interaction (existing assertion extended to cover the new adapters' constructors).

### Parallel opportunities

T023 lands first because T024 imports its updated prop shape. T024 (two file updates) can run in parallel internally. T025 is the final integration step.

### Dependencies

WP05, WP06, WP07.

### FR/NFR coverage

FR-009, FR-010, FR-013, C-004, C-005, AS-1, AS-2, AS-7, AS-8, AS-10, AS-11.

### Risks

- `DedupButton` prop change is a breaking refactor for all existing call-sites. **Mitigation**: both row components are updated in T024; tests for both are updated together; review confirms no other consumer remains.
- A test that constructs `SpicetifyTracksEnumerator` at module load could trigger `Spicetify.*` access (architecture test catches direct imports but not runtime access). **Mitigation**: adapter constructors are side-effect-free; tests assert no global access at construction.

---

## WP09 — ADRs & Live Verification

**Goal**: Capture the four load-bearing design decisions as ADRs (`DIRECTIVE_003`) and complete the mandatory live-verification artefact (per memory `spec-kitty-live-verification-required`).
**Priority**: P2 (closes governance + DoD).
**Estimated prompt size**: ~280 lines.
**Independent test**: ADR files exist and pass markdown lint; live-verification screenshot is attached and referenced in the WP's evidence.

### Subtasks

- [x] T026 ADR-0006 — separate `detection-store` (WP09)
- [x] T027 ADR-0007 — `AbortSignal` as the cancellation primitive (WP09)
- [x] T028 ADR-0008 — progress signal shape (stage + counts) (WP09)
- [x] T029 ADR-0009 — sequential enrichment + local Retry-After honoring (WP09)
- [x] T030 Live verification — build extension, run end-to-end flow, capture screenshot (WP09)

### Implementation sketch

Each ADR follows the existing format in `.claude/adr/0001-…`: **Status** (Accepted), **Context**, **Decision**, **Consequences**, **Alternatives considered**, **References** (back to spec.md, plan.md, research.md). Bodies are short — the why-and-what lives in `research.md`, the ADR just pins the decision so a future contributor can find it without re-reading the planning chain.

Live verification (T030) per `quickstart.md` §Manual verification:
1. `npm run build-local` (extension bundle).
2. `spicetify config custom_apps spicetify-dedup && spicetify apply`.
3. Open Spotify desktop client, navigate to the Dedup page.
4. Click "Load library"; verify rows render.
5. Click dedup button on Liked Songs (or a playlist known to contain duplicates).
6. Verify `idle → scanning → loaded` transitions render in real time.
7. Verify the displayed group count + tracks-to-remove count matches expectation.
8. Re-click the same row's button; verify atomic replace (no `loaded` flash).
9. Click another row while the first is in flight; verify both progress independently.
10. Navigate away mid-scan and return; verify rows are idle.
11. Capture a screenshot of the loaded summary.
12. Attach the screenshot path to the WP's evidence record.

### Parallel opportunities

The four ADRs are independent files — fully parallelizable. T030 must run after WP08 lands (live-verification needs a running extension).

### Dependencies

WP08 (T030 requires the production-wired extension).

### FR/NFR coverage

SC-001 through SC-007 (verified end-to-end), DIRECTIVE_003 (ADRs land for every load-bearing decision).

### Risks

- Live-verification is the second time this repo has needed it; memory `spec-kitty-live-verification-required` flags a prior incident. **Mitigation**: the WP09 prompt makes the screenshot artefact non-skippable — the implementer must produce and reference it before marking WP09 done.
- ADR numbering must continue from 0005 without collision. **Mitigation**: prompts pin the exact numbers; reviewer checks `.claude/adr/` for any 0006/0007/0008/0009 already in flight.

---

## Execution order (suggested)

```
WP01 (foundation: types + errors + FSM)
   ↓
WP02 (domain: key + parser + detector) ─┐
   ↓                                    │
WP03 (ports + retry-after) ─────────────┤
   ↓                                    │
WP04 (fakes + composition adapter) ─────┤
   ↓                                    │
WP05 (Spicetify adapters)  ┬────────────┤
   ↓                       │            │
WP06 (store + integration) ┘            │
   ↓                                    │
WP07 (UI views) ────────────────────────┤
   ↓                                    │
WP08 (UI wiring + production app.tsx) ──┘
   ↓
WP09 (ADRs + live verification)
```

WP01 → WP02 → WP03 are the foundation chain (each depends on the prior). WP04 and WP05 both depend on WP03 and can lane in parallel — WP05's adapters do not import WP04's fakes. WP06 depends on WP04 (integration test consumes the composition adapter). WP07 depends only on WP01 — could parallel-lane with WP04/WP05. WP08 depends on WP05+WP06+WP07. WP09 is documentation + live-verification, mostly parallelizable but T030 must follow WP08.

`finalize-tasks` will compute the actual lanes from the WPs' declared `dependencies` arrays.

## MVP scope

If the user wants to ship the smallest valuable slice early, the MVP is **WP01 + WP02 + WP04** — at that point the pure detection pipeline is testable end-to-end with fakes, satisfying NFR-002 (purity) and demonstrating the algorithm against fixtures. The downstream WPs make it usable inside the client; without them, there is no user-facing feature.
