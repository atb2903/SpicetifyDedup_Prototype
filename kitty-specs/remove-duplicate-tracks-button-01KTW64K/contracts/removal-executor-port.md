# Contract — `RemovalExecutor` port

`src/ports/removal-executor.ts` · Adapters: `SpicetifyRemovalExecutor` (prod),
`FakeRemovalExecutor` (tests). Serves FR-003, FR-010, FR-012, NFR-002, C-003, C-005.

## Interface

```ts
import type {
  RemovalTarget, TrackRef, RemovalOutcome, RemovalProgressEvent,
} from '../domain/removal-types';

export interface RemovalExecutor {
  /**
   * Delete `tracks` from the single `target` collection. Resolves with a
   * per-track outcome (removed vs failed); rejects only for whole-operation
   * faults the adapter cannot attribute (e.g. host API absent → RemovalError
   * 'host-unavailable'). Honors `signal` between batches (AbortError).
   */
  remove(
    target: RemovalTarget,
    tracks: ReadonlyArray<TrackRef>,
    signal: AbortSignal,
    onProgress?: (event: RemovalProgressEvent) => void,
  ): Promise<RemovalOutcome>;
}
```

## Behavioral contract

1. **Single-collection scope (C-003).** One `target` per call. The adapter never touches
   another collection. The store passes the target whose button was pressed.
2. **Kind dispatch (C-005).**
   - `liked-songs` → `Spicetify.Platform.LibraryAPI.remove({ uris })` where `uris` is the
     batch's `tracks.map(t => t.uri)`. `uid` is ignored.
   - `playlist` → `Spicetify.Platform.PlaylistAPI.remove(playlistUri, batch.map(t => ({ uri: t.uri, uid: t.uid! })))`.
     Every playlist `TrackRef` MUST carry a `uid` (enforced upstream by `computeRemoveSet`).
3. **Batching + partial failure (FR-010 / AS-8).** Split `tracks` into batches of
   `BATCH_SIZE`. Await each batch's host call. On fulfilment, add the batch's tracks to
   `removed`; on rejection, add them to `failed` with the rejection's message, and
   continue with the remaining batches. Return the aggregate `RemovalOutcome`.
   - `removed.length + failed.length === tracks.length` (total — every requested track is
     accounted for).
   - `BATCH_SIZE` is a tuned constant (numeric bound → boundary-tested at
     `BATCH_SIZE − 1 / BATCH_SIZE / BATCH_SIZE + 1` total tracks, plus the empty case).
4. **Progress (NFR-002).** After each fulfilled batch, call `onProgress({ removedSoFar,
   total })` if provided.
5. **Cancellation.** Check `signal.aborted` between batches; throw `DOMException(
   'AbortError')` if aborted. (Cancellation mid-removal is not a spec FR but the store
   owns the controller; the adapter must not swallow abort.)
6. **Host availability.** If `Spicetify.Platform.LibraryAPI`/`PlaylistAPI` (or the needed
   method) is absent, throw `RemovalError('host-unavailable', …)` before any mutation.
7. **No retsplit surprises.** The adapter does not re-order or deduplicate `tracks`; the
   domain produced them in the correct (later-copies) order.

## Live-verification dependency (DoD)

The adapter WP cannot reach `done` until the `research.md` §5 live checks pass — in
particular whether a bulk `remove` is atomic (drives `BATCH_SIZE` and the possible
per-track fallback) and whether a stale `uid`/URI is a no-op (A-5). The Spicetify adapter
keeps the host calls behind the injected platform interface (same pattern as
`SpicetifyTracksEnumerator`) so tests stub them and the live trace validates the real
shapes.

## FakeRemovalExecutor (test double)

Constructed with a script: a sequence of per-batch results (`'ok'` | `{ failUris: […] }`
| `throw`). Records the calls it received (target, tracks, batch boundaries) so store/UI
integration tests assert single-collection scope and partial-failure plumbing without
mocking internals (`DIRECTIVE_036`).
