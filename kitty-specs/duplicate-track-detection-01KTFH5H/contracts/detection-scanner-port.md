# Port Contract: `DetectionScanner`

**Mission**: `duplicate-track-detection-01KTFH5H` · **Layer**: `src/ports/detection-scanner.ts`

Composes `TracksEnumerator`, `CatalogEnricher`, and the pure `detect` algorithm into a single orchestrated scan. The store consumes this port; production wires a thin composition adapter in `src/adapters/detection-scanner.ts`; tests can swap in a fake to drive store behavior end-to-end without touching the underlying ports.

## Interface

```ts
import type {
  DetectionResult,
  ProgressEvent,
  ScanRequest,
} from '../domain/detection-types';

export interface DetectionScanner {
  /**
   * Run a full scan of `request`'s collection: enumerate → enrich → match → group.
   *
   * @param request — discriminated payload identifying the collection.
   * @param signal — fires `'abort'` to cancel (re-trigger / route-reset).
   * @param onProgress — invoked with `enumerating | enriching | matching` events.
   *
   * @returns Promise resolving with the finalized `DetectionResult`.
   *
   * @throws DetectionError on any downstream port failure. Specifically the
   *         scanner re-throws whatever the enumerator or enricher throws,
   *         without remapping reasons.
   * @throws DOMException('AbortError') when `signal` aborts.
   */
  scan(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<DetectionResult>;
}
```

## Composition shape (the production adapter)

```ts
export function createDetectionScanner(
  enumerator: TracksEnumerator,
  enricher: CatalogEnricher,
  clock: () => number = Date.now,
): DetectionScanner;
```

The factory takes both ports plus an injectable clock (used for `DetectionResult.completedAt` — injected to make snapshot tests deterministic). It returns an object implementing `DetectionScanner`.

The implementation is a small `async` function:
1. `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
2. `const enumeratedHostCount = …` — derived from progress events (capturing the first `total !== null` value emitted by the enumerator).
3. `const tracks = await enumerator.enumerate(request, signal, onProgress);`
4. `const skippedLocalCount = enumeratedHostCount - tracks.length;` (if `enumeratedHostCount` was observed; else `0` and a `// TODO`-free fallback path documented).
5. `if (tracks.length === 0) return emptyResult(request, clock(), skippedLocalCount);`
6. `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
7. `const slots = await enricher.enrich(tracks, signal, onProgress);`
8. `const enriched = slots.filter(isEnrichedSlot).map(s => s.track);`
9. `const unenrichedCount = slots.length - enriched.length;`
10. `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
11. `onProgress({ stage: 'matching', processed: 0, total: enriched.length });`
12. `const groups = detect(enriched);`
13. `onProgress({ stage: 'matching', processed: enriched.length, total: enriched.length });`
14. Assemble and return `DetectionResult`.

The composition adapter performs **no host calls itself** — it is purely a coordinator. This keeps the architecture test happy (`src/adapters/detection-scanner.ts` does not import any `Spicetify.*` global) and makes the orchestration directly unit-testable with `FakeTracksEnumerator` + `FakeCatalogEnricher`.

## Guarantees

### No partial result on failure (NFR-005)
If the enumerator or enricher throws (anything other than `AbortError`), the scan rejects with that same error. No `DetectionResult` is ever returned alongside a failure. The store catches the throw and dispatches `fail`, which the FSM converts to `failed(reason)` (§5 of data-model.md).

### Atomic abort
An `AbortError` thrown by the scanner is **not** propagated to the store as a `fail` action — the scanner sets a flag on the `Error` (via the standard `error.name === 'AbortError'`) and the store's wrapper distinguishes:
- `e instanceof DOMException && e.name === 'AbortError'` → no FSM dispatch (the cancel/reset has already moved the row to `idle`).
- otherwise → dispatch `{ type: 'fail', reason: <DetectionError or wrapped> }`.

### Deterministic order (NFR-001)
Given the same input collection (same `RawTrack[]` from the enumerator), `detect` produces the same `DuplicateGroup[]` in the same order. The composition adapter does not mutate ordering at any step — `enriched` preserves the enumerator's order, and `detect` iterates in array order.

### Progress contract
- Enumerator emits `enumerating` events.
- Enricher emits `enriching` events.
- Scanner emits exactly two `matching` events (start + end).
- No event is emitted while `signal.aborted` is true (the scanner checks before each port call).

### Empty-collection shape
For a collection that the enumerator yields `[]`:
```ts
{ collectionKey, completedAt: clock(), groups: [],
  duplicateTrackCount: 0, removableTrackCount: 0,
  skippedLocalCount, unenrichedCount: 0, scannedTrackCount: 0 }
```
No `enriching` or `matching` events are emitted (the scanner short-circuits). The store sees a `loaded` state with an empty `groups` array, and the UI renders "No duplicates found" (FR-009).

## Error modes

Errors are pass-through. The scanner does **not** invent new reasons; it only adds `aborted` semantics:

| Source | Surfaced as |
|---|---|
| `enumerator.enumerate` throws `DetectionError(reason)` | Same `DetectionError(reason)` |
| `enricher.enrich` throws `DetectionError(reason)` | Same `DetectionError(reason)` |
| `signal.aborted` fires | `DOMException('AbortError')` — not a `DetectionError`; consumed by the store |
| `detect` throws (would indicate a programming error — algorithm is total) | Re-thrown as-is; the store wraps non-`DetectionError` throws in `DetectionError('catalog-rejected', …, { cause })` for the UI (defensive — algorithm is total by design) |

## Test surface (black-box)

`detection-scanner.test.ts` exercises the composition with the fake enumerator + fake enricher:
- Happy path: empty collection / 1 group / multiple groups.
- Abort before enumerate: throws `AbortError`, no port calls.
- Abort between enumerate and enrich: throws `AbortError`, enricher never called.
- Abort during enrich: throws `AbortError`, no `matching` event emitted.
- Enumerator throws `DetectionError('enumerator-failed')`: re-thrown, enricher never called.
- Enricher throws `DetectionError('rate-limit-unparseable')`: re-thrown.
- Determinism: same fake input produces byte-equivalent `DetectionResult.groups` across runs.
- Clock injection: assert `completedAt` equals the injected clock's return value.

A separate `integration/detection-end-to-end.test.ts` wires the *real* `createDetectionScanner` to the *fake* enumerator + enricher and dispatches via the *real* `detection-store`, asserting the full row-click-to-summary surface (DIRECTIVE_036).

## Architecture constraints (`test/architecture.test.ts`)

- `src/ports/detection-scanner.ts` may import from `src/domain/` only.
- `src/adapters/detection-scanner.ts` may import from `src/domain/` + `src/ports/` only. It MUST NOT import `Spicetify.*` globals (asserted by the existing architecture test's `src/adapters` rules + a new spot-check in `detection-scanner.test.ts` if the test ever drifts).

## Fail-loud + classifier pairing

The scanner itself does not own a parser. Fail-loud + classifier pairings live in the underlying parsers (`enriched-track-parser.ts`, `retry-after.ts`); the scanner inherits them through the ports it composes.
