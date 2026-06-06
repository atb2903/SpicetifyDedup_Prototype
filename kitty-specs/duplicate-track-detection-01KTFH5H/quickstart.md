# Quickstart: Duplicate Track Detection

**Mission**: `duplicate-track-detection-01KTFH5H` · **Plan**: [`plan.md`](./plan.md)

A walkthrough for a developer landing in this mission's code. Reads top-to-bottom; cross-links to the contracts and the data model where shapes matter.

---

## TL;DR

When the user clicks the dedup button on a row, the row's `onClick` calls `detectionStore.scanCollection(collectionKey, request)`. The store:
1. aborts any in-flight scan on that row,
2. transitions the row to `scanning`,
3. invokes `DetectionScanner.scan(request, signal, onProgress)`,
4. mirrors progress events into the row's `scanning` state,
5. on success transitions to `loaded(result)`,
6. on `DetectionError` transitions to `failed(reason)`,
7. on `AbortError` transitions back to `idle` (the cancel already moved us there — this is defense-in-depth).

The scanner composes `TracksEnumerator` (paged host calls) → `CatalogEnricher` (50-ID batched catalog lookups) → `detect()` (pure algorithm). Local files are filtered at enumeration; catalog `null`s become `unenriched` slots; both counts surface on the final `DetectionResult`.

---

## One click — full flow

```
User clicks <DedupButton> on a row
              │
              ▼
ui/PlaylistRow.tsx (or LikedSongsRow.tsx)
  onClick → useDetectionStore(s => s.scanCollection)(key, request)
              │
              ▼
store/detection-store.ts
  scanCollection(key, request):
    1. if rows[key]?.kind === 'scanning'
         controllers[key].abort()         ← FR-011 atomic replace
    2. controllers[key] = new AbortController()
    3. dispatch { type: 'start' }         ← FSM moves idle/loaded/failed → scanning
    4. try {
         const result = await scanner.scan(
           request,
           controllers[key].signal,
           ev => dispatch({ type: 'progress', event: ev }),
         );
         dispatch({ type: 'complete', result });
       } catch (e) {
         if (e instanceof DOMException && e.name === 'AbortError') {
           // already moved to idle by cancel/reset
           return;
         }
         const reason = isDetectionError(e)
           ? e
           : new DetectionError('catalog-rejected', '…', { cause: e });
         dispatch({ type: 'fail', reason });
       } finally {
         delete controllers[key];
       }
              │
              ▼
adapters/detection-scanner.ts  (the composition adapter)
  scan(request, signal, onProgress):
    1. assert !signal.aborted
    2. tracks = await enumerator.enumerate(request, signal, onProgress)
    3. if tracks.length === 0 → emptyResult shortcut
    4. slots  = await enricher.enrich(tracks, signal, onProgress)
    5. enriched = slots.filter(isEnriched).map(s => s.track)
    6. onProgress({ stage: 'matching', processed: 0, total: enriched.length })
    7. groups = detect(enriched)         ← pure domain
    8. onProgress({ stage: 'matching', processed: enriched.length, total: enriched.length })
    9. return assembleResult(…)
              │
              ▼
ui/PlaylistRow.tsx re-renders
  - kind === 'scanning' → <ScanningView stage processed total />
  - kind === 'loaded'   → <DetectionLoadedSummary result />
  - kind === 'failed'   → <DetectionFailedView reason />
```

---

## File map (what to read first)

If you're new to the mission, read in this order:

1. **[`data-model.md`](./data-model.md)** — every type and FSM, with FR/NFR/C coverage.
2. **[`contracts/detection-scanner-port.md`](./contracts/detection-scanner-port.md)** — the orchestration shape.
3. **[`contracts/tracks-enumerator-port.md`](./contracts/tracks-enumerator-port.md)** — enumeration semantics, abort, local-file filtering.
4. **[`contracts/catalog-enricher-port.md`](./contracts/catalog-enricher-port.md)** — batching, Retry-After, error classification.
5. **[`research.md`](./research.md)** — decisions + alternatives if you need the "why".

Then in the codebase:

| File | Why |
|---|---|
| `src/domain/duplicate-detector.ts` | The pure algorithm. ~30 LOC. Read this with `duplicate-detector.test.ts` open. |
| `src/domain/detection-state.ts` | The row's FSM. The transition table is the test surface; 20 cells. |
| `src/adapters/detection-scanner.ts` | The 9-step composition. Verifies the contract above. |
| `src/store/detection-store.ts` | Where re-trigger / cancel / reset semantics actually live. |

---

## How re-trigger works (FR-011)

The user clicks dedup on the same row twice in quick succession:

```
Click 1 → scanCollection(key, request)
  - no in-flight scan: skip abort step
  - new AbortController; signal A
  - dispatch start; state → scanning(progress=enumerating/0/null)
  - scanner.scan(…, signal A, …)  starts

Click 2 → scanCollection(key, request)   [scan A still in flight]
  - in-flight: controllers[key].abort()  (signal A fires)
  - new AbortController; signal B
  - dispatch start; state → scanning(progress=enumerating/0/null)
  - scanner.scan(…, signal B, …)  starts

(scan A's await unblocks)
  - throws DOMException('AbortError')
  - store's catch sees AbortError → returns without dispatching

(scan B continues)
  - on success → dispatch complete; state → loaded(result B)
```

The row is **never** observed mid-transition with two live signals. From the UI's perspective, the row read `scanning` continuously between the two clicks; the eventual `loaded` carries result B.

---

## How route-reset works (FR-012)

The user navigates away from the Dedup page:

1. The page component's unmount-aware `RouteResetContext` calls `detectionStore.reset()` (mirrors the existing `playlistsStore.reset()` wiring).
2. `reset()` walks every entry in `controllers` and calls `abort()` on each signal, then clears the map and dispatches `{ type: 'cancel' }` for every row currently in `scanning`.
3. Every in-flight scan throws `AbortError` at its next await boundary (host call, sleep, or scanner check) and the store's catch returns without dispatching.

After reset, `rows` is empty: returning to the Dedup page lands on idle rows ready to scan.

---

## How parallel scans on different rows stay independent (NFR-007)

Two clicks land within milliseconds: one on Liked Songs, one on a playlist row.

```
scanCollection('liked-songs', { kind: 'liked-songs' })
  controllers['liked-songs'] = AC₁
  rows['liked-songs'] = scanning
  scanner.scan(request₁, AC₁.signal, onProgress₁)  ─── promise chain 1

scanCollection('spotify:playlist:abc', { kind: 'playlist', playlistUri })
  controllers['spotify:playlist:abc'] = AC₂
  rows['spotify:playlist:abc'] = scanning
  scanner.scan(request₂, AC₂.signal, onProgress₂)  ─── promise chain 2
```

Two independent promise chains. Each scanner runs its own enumerator → enricher → algorithm sequence. Each has its own AbortController. Each `onProgress` mutates only its own row's state. The catalog endpoint may apply rate limits across both chains (shared host throttle); the store does not.

Cancel/reset on one row does not affect the other:
- `cancelScan('liked-songs')` aborts AC₁ only.
- The playlist scan keeps going.

---

## How failure works (NFR-005, AS-8)

The enricher throws `DetectionError('auth-token-expired')` mid-scan.

```
1. enricher.enrich(…) rejects with DetectionError('auth-token-expired', …)
2. scanner.scan(…) re-throws (no remap)
3. store catch:
   - not AbortError
   - isDetectionError(e) → true → reason = e
   - dispatch { type: 'fail', reason }
4. FSM: scanning + fail → failed(reason)
5. UI renders <DetectionFailedView reason="auth-token-expired"/>
   → "Spotify signed out mid-scan — sign back in and retry."
```

The partial enumeration result and any partial enrichment slots are **discarded** — they never become a `DetectionResult`. The user never sees a partial as complete. NFR-005 ✓.

---

## Boundary tests that *must* pass

From `data-model.md` §9, here are the load-bearing boundary cases. Each lives in its own `*.test.ts`; if you change implementation, run these first.

| File | Cases |
|---|---|
| `duplicate-detector.test.ts` | duration delta 0 / 1 / 1999 / 2000 (incl) / 2001 ms |
| `enriched-track-parser.test.ts` | missing id, missing name, empty artists[], negative duration, non-integer duration |
| `spicetify-catalog-enricher.test.ts` | 0 / 1 / 49 / 50 / 51 / 100 IDs; 429 with `Retry-After: 0`, `1`, `3600`, missing; 401; 200 with bad shape |
| `retry-after.test.ts` | `undefined`, `''`, `'0'`, `'0.5'`, `'-1'`, `'3600'`, `'abc'`, RFC-7231 date |
| `detection-state.test.ts` | 4 states × 5 actions = 20 cells; ignored cells return identical reference |
| `detection-store.test.ts` | 0/1/2 concurrent rows; re-trigger; route-reset; cancel of non-scanning row is a no-op |

NFR-003 + NFR-009: 100% line + branch coverage enforced at the runner. CI fails if any of the above slip.

---

## ADRs landing with this mission

Four ADRs in `.claude/adr/`:

| ADR | Subject | Anchored in |
|---|---|---|
| 0006 | Separate `detection-store` (alongside `playlists-store`) | `research.md` R-002 |
| 0007 | `AbortSignal` as the sole cancellation primitive | `research.md` R-003 / R-010 |
| 0008 | Progress signal shape (stage + counts via injected callback) | `research.md` R-004 |
| 0009 | Sequential enrichment batching (1 in flight; `Retry-After` honored locally) | `research.md` R-005 / R-009 |

If you're proposing a deviation from any of these decisions, read the ADR first and amend it via the standard ADR-supersedes mechanism — don't change the implementation against an unrevised ADR.

---

## Running the tests

```bash
npm run test           # vitest watch
npm run test:run       # vitest one-shot (CI)
npm run test:coverage  # vitest + v8 coverage; gate at 100% line + branch
```

Pure-domain tests run without happy-dom. Adapter tests use `vi.useFakeTimers()` for the `Retry-After` sleep cases. UI tests use `@testing-library/react` + happy-dom.

The architecture test (`test/architecture.test.ts`) runs as part of `test:run` and asserts the import graph — if a new file in `src/domain/` accidentally imports from `src/adapters/`, that test fails with the offending file path and the rule it broke.

---

## Manual verification (live-verification per memory `spec-kitty-live-verification-required`)

Once the implementation lands, the WP's DoD includes:

1. Build the extension with `npm run build-local`.
2. Apply it to a real Spotify client via `spicetify config custom_apps spicetify-dedup && spicetify apply`.
3. Open the Dedup page; click "Load library".
4. Click the dedup button on Liked Songs (or any playlist with known duplicates).
5. Watch the row transition `idle → scanning → loaded`.
6. Verify the displayed group count + tracks-to-remove count matches expectation.
7. Re-click the same row's button; confirm atomic replace (no flash of stale state).
8. Click another row while the first is in flight; confirm both progress independently.
9. Navigate away mid-scan and return; confirm rows are idle again.

Capture a screenshot of the loaded summary as the live-verification artefact for the implement-review handoff.
