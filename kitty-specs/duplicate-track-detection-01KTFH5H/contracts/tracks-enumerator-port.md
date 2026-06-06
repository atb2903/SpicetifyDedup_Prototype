# Port Contract: `TracksEnumerator`

**Mission**: `duplicate-track-detection-01KTFH5H` · **Layer**: `src/ports/tracks-enumerator.ts`

Enumerates the non-local tracks in a single user collection (Liked Songs or a specific playlist). The port is the seam between the host-bound enumeration step and the rest of the detection pipeline; production wires `SpicetifyTracksEnumerator`; tests wire `FakeTracksEnumerator`.

## Interface

```ts
import type { RawTrack, ScanRequest, ProgressEvent } from '../domain/detection-types';

export interface TracksEnumerator {
  /**
   * Enumerate every non-local track in the collection identified by `request`.
   *
   * @param request — discriminated payload identifying Liked Songs or a playlist URI.
   * @param signal — fires `'abort'` when the caller cancels (re-trigger, route-reset).
   * @param onProgress — invoked once per host page with `{ stage: 'enumerating', processed, total }`.
   *
   * @returns Promise resolving with the full ordered list of `RawTrack`
   *          (local files filtered out before the array is returned).
   *          Resolves *only* with a complete enumeration — no partial arrays.
   *
   * @throws DetectionError('enumerator-failed', …, { cause })
   *         on any host shape drift, network failure, or non-success response.
   * @throws DetectionError('auth-token-expired', …)
   *         if the host surfaces an expired-token signal during pagination.
   * @throws DOMException('AbortError')
   *         when `signal` aborts before resolution (caught by the scanner;
   *         not surfaced to the store as `failed`).
   */
  enumerate(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<RawTrack>>;
}
```

## Guarantees

### Atomicity
`enumerate()` resolves with a complete `RawTrack[]` or throws. No partial arrays are ever returned — if pagination dies on page N of M, the entire call rejects (NFR-005 alignment for the enumeration step).

### Order preservation
The returned array is in **host-native iteration order**: the order the host paginates the collection, page-by-page, item-by-item within each page. `RawTrack.position` is `0..length-1` in that order. FR-007's "earliest by iteration order" reads `members[0].position`.

### Local-file filtering
URIs matching `/^spotify:local:/` are excluded from the returned array. The exact count of skipped locals is **not** carried by this port — the scanner derives it later as `(<host's totalLength sum> − returnedArray.length)` and stamps `skippedLocalCount` on the final `DetectionResult`. Keeping the count off this port surface avoids a structural-return wrapper.

### No host fetches before invocation
The adapter performs **zero** host calls from its constructor or module-load side effects. Every fetch happens within `enumerate()`. Matches the existing `PlaylistsLoader` adapter convention and the charter's no-auto-run posture.

### Cancellation semantics
- `signal.aborted` is checked at every page boundary (after `getTracks`/`getContents` returns, before requesting the next page).
- If `signal.aborted === true` at entry, the call throws `DOMException('AbortError')` immediately without making any host call.
- If `signal` fires mid-page, the in-flight host call is **not** aborted (the Spicetify Platform APIs do not accept `AbortSignal`); the call resolves, the result is discarded, and `DOMException('AbortError')` is thrown.
- Future ports backed by `CosmosAsync` or `fetch` SHOULD pass `signal` through for prompt mid-call cancellation.

### Progress events
- Emitted once per host page after that page lands.
- `processed` is the cumulative post-local-filter count.
- `total` is set to the host's `totalLength` from the first page and held constant. Until then, `total` is `null`.
- No mid-page events — page sizes are 200 (data-porter default) so per-page granularity is acceptable; finer-grained events would require post-processing the host's page payload and add no UX value.

## Error modes

| Condition | Thrown | `context` |
|---|---|---|
| `LibraryAPI.getTracks` / `PlaylistAPI.getContents` rejects | `DetectionError('enumerator-failed', …, { cause })` | `{ phase: 'paging', offset, limit }` |
| Page payload does not match expected shape | `DetectionError('enumerator-failed', …)` | `{ phase: 'validating', offset, sampleKeys }` |
| Item is missing required field (`uri`, `name`, `artists[0]`) | `DetectionError('enumerator-failed', …)` | `{ phase: 'validating-item', offset, indexInPage, missingField }` |
| 401 surfaced via the Platform API | `DetectionError('auth-token-expired', …)` | `{ phase: 'paging' }` |
| Abort during a between-page check | `DOMException('AbortError')` | n/a |
| `request.kind === 'playlist'` but `playlistUri` is empty / malformed | Throws **synchronously** before any host call — `DetectionError('enumerator-failed', …, { context: { phase: 'precheck', playlistUri } })` |

## Fail-loud + classifier pairing

The enumerator's shape validator is paired with a classifier predicate `isLibraryTrackItem(x): x is LibraryTrackItem`, exported from the adapter file alongside the parser, so callers (and tests) can pre-check without `try`/`catch`. This satisfies NFR-008 / charter Input Validation for the enumeration boundary.

## Test surface (black-box)

`FakeTracksEnumerator` implements the same interface, returning a developer-provided fixture in deterministic order. Used by:
- `detection-scanner.test.ts` — drives the orchestration without a host.
- `detection-store.test.ts` — drives store behavior without a host.
- `integration/detection-end-to-end.test.ts` — drives the full row-click-to-summary path (DIRECTIVE_036).

`SpicetifyTracksEnumerator` is exercised by its own unit tests with a `Spicetify.Platform.*` mock; those tests verify the host-shape validator, pagination loop, and abort behavior.

## Architecture constraints (`test/architecture.test.ts`)

`src/ports/tracks-enumerator.ts` may import from `src/domain/` only. Adapter implementations live in `src/adapters/` and may import from both `src/domain/` and `src/ports/`.
