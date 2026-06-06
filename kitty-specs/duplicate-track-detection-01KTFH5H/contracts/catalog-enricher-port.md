# Port Contract: `CatalogEnricher`

**Mission**: `duplicate-track-detection-01KTFH5H` · **Layer**: `src/ports/catalog-enricher.ts`

Batches a list of track IDs into 50-ID requests against the Spotify catalog endpoint (`GET /v1/tracks?ids=…`), parses each response, and emits the enriched track records the duplicate-detection algorithm needs. The port is the only place in the system that issues catalog HTTP calls.

## Interface

```ts
import type { EnrichedTrack, ProgressEvent, RawTrack } from '../domain/detection-types';

export type EnrichmentSlot =
  | { kind: 'enriched'; track: EnrichedTrack }
  | { kind: 'unenriched'; position: number; rawUri: string };

export interface CatalogEnricher {
  /**
   * Enrich every track in `tracks` by fetching its catalog record.
   *
   * @param tracks — non-empty `RawTrack[]` from the enumerator. Order is preserved.
   * @param signal — fires `'abort'` when the caller cancels.
   * @param onProgress — invoked once per 50-ID batch completion with
   *                     `{ stage: 'enriching', processed, total }`.
   *
   * @returns Promise resolving with an `EnrichmentSlot[]` of the same length
   *          as `tracks`, aligned by position. `unenriched` slots correspond
   *          to catalog `null` returns.
   *
   * @throws DetectionError('auth-token-expired', …)
   * @throws DetectionError('rate-limit-unparseable', …)
   * @throws DetectionError('network-failure', …, { cause })
   * @throws DetectionError('malformed-enrichment-payload', …)
   * @throws DetectionError('catalog-rejected', …, { context: { status } })
   * @throws DOMException('AbortError')
   */
  enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>>;
}
```

### Empty-input invariant
If `tracks.length === 0`, the call resolves with `[]` immediately — no host call, no progress event. The scanner is responsible for short-circuiting empty enumerations before invoking the port, but the port enforces the no-op as defense in depth.

## Guarantees

### Sequential batching (R-005 / ADR-0009)
At most **one batch in flight per call**. The adapter is a `for` loop over chunks of 50 IDs, awaiting each `CosmosAsync.get(…)`. Sequential batching keeps the rate-limit pressure gentle and the adapter trivial. Concurrent calls (i.e. two different scans on two different rows) run their loops independently — the port does not coordinate cross-call rate limiting.

### Order alignment
The returned array length equals the input length. `result[i]` corresponds to `tracks[i]`. `EnrichmentSlot.position` (for `unenriched`) equals `tracks[i].position`.

### Retry-After honoring (NFR-004)
On a `429` response:
1. Parse the `Retry-After` header via `parseRetryAfter`. Missing or malformed → throw `DetectionError('rate-limit-unparseable')`.
2. Sleep for exactly the parsed duration via the abort-aware `sleep(ms, signal)` helper (R-010). Abort during sleep throws `DOMException('AbortError')` promptly.
3. Re-issue the same batch (the IDs that just failed). The retry counts as the next "attempt" of the same batch — `onProgress` is **not** emitted between the 429 and the retry's success.

The port honors the server's hint **exactly**: no client-side jitter, no exponential backoff, no max-retry cap. NFR-004 forbids "shorter (avoiding bans)" and "unbounded longer (avoiding stalls)" — both apply.

If the retry itself comes back 429, the loop repeats: parse, sleep, retry. There is no client-side limit on consecutive 429s; the user can `cancelScan` if the rate limit is persistent.

### Sequential host call shape
For each chunk of `RawTrack` (up to 50):
```ts
const idsParam = chunk.map(t => t.id).join(',');
const response = await Spicetify.CosmosAsync.get(
  `https://api.spotify.com/v1/tracks?ids=${idsParam}`,
);
```

### Response parsing
The expected success shape is `{ tracks: (CatalogTrack | null)[] }` aligned to the input order.
- For each slot:
  - `null` → `{ kind: 'unenriched', position, rawUri }`.
  - Object → validate via `isCatalogTrack`; on pass → `asEnrichedTrack(raw)` → `{ kind: 'enriched', track }`. On fail → throw `DetectionError('malformed-enrichment-payload', …, { context: { position, missingField } })`.
- If the top-level shape is wrong (no `tracks` array) → throw `DetectionError('catalog-rejected', …, { context: { status: 200, sampleKeys } })`.

### Error classification (CosmosAsync's silent-error quirk)
`Spicetify.CosmosAsync` does **not** throw on 4xx/5xx — it resolves with an error-shaped object (or with the raw error body). The adapter:
1. Checks for the `status` field on the resolved value.
2. `status === 429` → Retry-After path.
3. `status === 401` OR response body matches `/access token expired/i` → throw `DetectionError('auth-token-expired')`.
4. `status >= 400 && status < 500` → throw `DetectionError('catalog-rejected', …, { context: { status } })`.
5. `status >= 500` OR resolved value is an `Error` instance → throw `DetectionError('network-failure', …, { cause })`.
6. Otherwise (e.g. CosmosAsync threw a `TypeError` for a malformed URL) → throw `DetectionError('network-failure', …, { cause })`.

### Cancellation semantics
- Checked synchronously at the start of every batch loop iteration.
- Checked synchronously before and after every `await` (host call + sleep).
- `signal.aborted` mid-host-call: the host call resolves, its result is discarded, `DOMException('AbortError')` is thrown.
- Abort during `Retry-After` sleep: see R-010 — sleep helper races abort against the timeout.

### Progress events
- One `{ stage: 'enriching', processed, total }` per batch *completion* — emitted only after the batch's response is parsed (or after a successful retry following a 429).
- `processed` = cumulative number of enrichment **slots** populated (enriched + unenriched), not batches.
- `total` = `tracks.length`.
- No event for the very first call (before batch 1 completes) — the scanner emits the `enriching` stage transition itself.

## Test surface (black-box)

`FakeCatalogEnricher` implements the same interface using an in-memory map from track ID → `EnrichedTrack | null`. The fake supports:
- A "force 429" mode that fires `DetectionError('rate-limit-unparseable')` after N batches.
- A "force auth-expired" mode for AS-8 coverage.
- A "force shape-drift" mode for the malformed-payload path.
- A `signal` watchdog that resolves the promise as soon as abort fires (so tests don't have to wait on real I/O).

`SpicetifyCatalogEnricher` is tested with a `Spicetify.CosmosAsync` mock that returns scripted response objects. The 429 + Retry-After path is tested with `vi.useFakeTimers()` to verify the sleep duration matches the header value.

## Architecture constraints (`test/architecture.test.ts`)

`src/ports/catalog-enricher.ts` may import from `src/domain/` only. The Spicetify adapter (`src/adapters/spicetify-catalog-enricher.ts`) may import from `src/domain/` + `src/ports/` + `src/adapters/retry-after.ts`.

## Fail-loud + classifier pairing

The enrichment-payload parser (`asEnrichedTrack`) and its classifier (`isEnrichedTrack`) live in `src/domain/enriched-track-parser.ts`. Both fail-loud (parser throws) and pre-check (classifier returns `boolean`) paths are exercised by tests.

The Retry-After parser (`parseRetryAfter`) and its classifier (`isRetryAfterParseError`) live in `src/adapters/retry-after.ts`. Same pattern.
