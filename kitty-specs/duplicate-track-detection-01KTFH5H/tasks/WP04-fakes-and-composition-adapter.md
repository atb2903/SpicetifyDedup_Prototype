---
work_package_id: WP04
title: Test Doubles & Composition Adapter
dependencies:
- WP02
- WP03
requirement_refs:
- FR-006
- FR-008
- NFR-001
- NFR-005
- NFR-006
- NFR-007
- NFR-009
- NFR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-duplicate-track-detection-01KTFH5H
base_commit: 3c497a11e757bfff3f1614a993ec92d14b4d462b
created_at: '2026-06-10T09:23:27.827155+00:00'
subtasks:
- T011
- T012
- T013
shell_pid: "52422"
agent: "claude:claude-sonnet-4-6:reviewer:reviewer"
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/adapters/
execution_mode: code_change
owned_files:
- src/adapters/fake-tracks-enumerator.ts
- src/adapters/fake-catalog-enricher.ts
- src/adapters/detection-scanner.ts
- test/adapters/fake-tracks-enumerator.test.ts
- test/adapters/fake-catalog-enricher.test.ts
- test/adapters/detection-scanner.test.ts
tags: []
---

# WP04 — Test Doubles & Composition Adapter

## Objective

Make the full detection pipeline testable end-to-end without touching Spicetify:

1. `FakeTracksEnumerator` — implements the enumerator port using developer-provided fixtures.
2. `FakeCatalogEnricher` — implements the enricher port from an in-memory map; supports force modes for error-path coverage.
3. `createDetectionScanner(enumerator, enricher, clock)` — the pure composition adapter (9-step orchestration) wired to the `DetectionScanner` port.

After this WP, WP06 (detection store + integration test) can exercise the full row-click-to-result path without a host.

## Context

The composition adapter performs **zero host calls**. It is purely a coordinator over the two underlying ports. The architecture test should report no boundary violations; a spot-check in `detection-scanner.test.ts` confirms no `Spicetify.*` reference appears in the file body.

Read first:
- [`../contracts/detection-scanner-port.md`](../contracts/detection-scanner-port.md) — §"Composition shape" lists the 9 steps verbatim.
- [`../contracts/tracks-enumerator-port.md`](../contracts/tracks-enumerator-port.md) — §"Test surface" describes the FakeTracksEnumerator contract.
- [`../contracts/catalog-enricher-port.md`](../contracts/catalog-enricher-port.md) — §"Test surface" describes the FakeCatalogEnricher force-modes.
- [`../quickstart.md`](../quickstart.md) §"One click — full flow" — the prose narrative of the composition.
- `src/adapters/fake-playlists-loader.ts` (existing) — pattern for fakes (constructor takes fixture / config; methods honor the port contract).

Architectural constraints: `src/adapters/` may import from `src/domain/` + `src/ports/` + sibling `src/adapters/` files only.

## Branch strategy

Planning base & merge target: **`main`**. Depends on WP02 (uses `detect`) and WP03 (port interfaces). The composition adapter does *not* depend on WP05's Spicetify adapters — those parallel-lane.

## Subtasks

### T011 — `FakeTracksEnumerator` (`src/adapters/fake-tracks-enumerator.ts`)

**Purpose**: In-memory test double implementing `TracksEnumerator`. Tests construct it with fixture tracks; it pages them, emits progress events, and honors `AbortSignal`.

**Constructor signature**:
```ts
export class FakeTracksEnumerator implements TracksEnumerator {
  constructor(opts: {
    /** Fixture tracks (in collection order, post-local-filter). */
    tracks: ReadonlyArray<RawTrack>;
    /** Page size for simulated pagination. Default 200. */
    pageSize?: number;
    /** Optional override: host's reported `totalLength` including locals. Default = tracks.length. */
    hostTotalLength?: number;
    /** If true, throws DetectionError('enumerator-failed') on the first page. */
    failOnFirstPage?: boolean;
  });
  enumerate(request: ScanRequest, signal: AbortSignal, onProgress: …): Promise<ReadonlyArray<RawTrack>>;
}
```

**Behavior**:
- Chunk fixture into pages of `pageSize`.
- For each page boundary, `await Promise.resolve()` (microtask yield), check `signal.aborted` → throw `DOMException('aborted', 'AbortError')` if so.
- Emit `{ stage: 'enumerating', processed: cumulativeCount, total: hostTotalLength }` after each page.
- After all pages, resolve with the full array.
- If `failOnFirstPage` → throw `DetectionError('enumerator-failed', 'fake failure')`.

**Tests** (`test/adapters/fake-tracks-enumerator.test.ts`):
- Empty fixture → resolves `[]` immediately, no progress event.
- Single-page fixture (e.g. 5 tracks, `pageSize: 10`) → one progress event with `processed: 5, total: 5`.
- Multi-page fixture (e.g. 250 tracks, `pageSize: 100`) → 3 progress events with cumulative `processed`.
- Abort before first page → throws `AbortError`, no progress emitted.
- Abort between pages → throws `AbortError` at the page boundary check.
- `failOnFirstPage: true` → throws `DetectionError('enumerator-failed')`.
- `hostTotalLength: 100` with `tracks.length: 80` → `total` in progress events is 100 (the host's count; the post-local-filter count is `processed`).

**Files**:
- `src/adapters/fake-tracks-enumerator.ts` (new, ~90 lines).
- `test/adapters/fake-tracks-enumerator.test.ts` (new, ~140 lines).

### T012 — `FakeCatalogEnricher` (`src/adapters/fake-catalog-enricher.ts`)

**Purpose**: In-memory test double implementing `CatalogEnricher`. Built from a map; supports force-modes for error-path tests.

**Constructor signature**:
```ts
export class FakeCatalogEnricher implements CatalogEnricher {
  constructor(opts: {
    /** Map from track id → EnrichedTrack | null (null simulates catalog `null`). */
    catalog: ReadonlyMap<string, EnrichedTrack | null>;
    /** Simulated batch size. Default 50. */
    batchSize?: number;
    /** Force modes (mutually exclusive). */
    forceMode?: 'auth-expired' | 'rate-limit-unparseable' | 'shape-drift';
    /** Number of batches to process before the force-mode throws. Default 0 (immediate). */
    forceAfterBatches?: number;
  });
  enrich(tracks: …, signal: …, onProgress: …): Promise<ReadonlyArray<EnrichmentSlot>>;
}
```

**Behavior**:
- Empty input → resolves `[]` (empty-input invariant from catalog-enricher contract).
- For each batch (chunked by `batchSize`):
  - `await Promise.resolve()`.
  - Check `signal.aborted`; throw `AbortError` if so.
  - If force-mode and batch index ≥ `forceAfterBatches`:
    - `'auth-expired'` → throw `DetectionError('auth-token-expired')`.
    - `'rate-limit-unparseable'` → throw `DetectionError('rate-limit-unparseable')`.
    - `'shape-drift'` → throw `DetectionError('malformed-enrichment-payload')`.
  - Otherwise, for each track in batch, look up `catalog.get(track.id)`:
    - `null` → push `{ kind: 'unenriched', position, rawUri }`.
    - `EnrichedTrack` → push `{ kind: 'enriched', track }`.
    - Undefined (id not in map) → treat as `null` (unenriched).
  - Emit `{ stage: 'enriching', processed: cumulativeSlotCount, total: tracks.length }`.

**Tests** (`test/adapters/fake-catalog-enricher.test.ts`):
- Empty input → resolves `[]`, no progress.
- Single batch (e.g. 10 tracks, `batchSize: 50`) → 1 progress event.
- Multi-batch (e.g. 120 tracks, `batchSize: 50`) → 3 progress events with cumulative slot counts.
- `null` in catalog → returns `unenriched` slot with correct `position` and `rawUri`.
- Unknown id (not in map) → treated as unenriched.
- Force `'auth-expired'` → throws `DetectionError('auth-token-expired')`.
- Force `'rate-limit-unparseable'` after 2 batches → first 2 batches succeed, 3rd batch throws.
- Force `'shape-drift'` → throws `DetectionError('malformed-enrichment-payload')`.
- Abort before first batch → throws `AbortError`, no host work simulated.
- Abort mid-stream → first batch resolves, second batch's signal check throws.
- Order alignment: `result[i]` corresponds to `tracks[i]`.

**Files**:
- `src/adapters/fake-catalog-enricher.ts` (new, ~110 lines).
- `test/adapters/fake-catalog-enricher.test.ts` (new, ~180 lines).

### T013 — Composition adapter (`src/adapters/detection-scanner.ts`)

**Purpose**: A factory function that returns a `DetectionScanner` by composing an enumerator + enricher + the pure `detect` algorithm. The 9-step body comes verbatim from `contracts/detection-scanner-port.md`.

**Signature**:
```ts
import type { TracksEnumerator } from '../ports/tracks-enumerator';
import type { CatalogEnricher } from '../ports/catalog-enricher';
import type { DetectionScanner } from '../ports/detection-scanner';
import { detect } from '../domain/duplicate-detector';

export function createDetectionScanner(
  enumerator: TracksEnumerator,
  enricher: CatalogEnricher,
  clock: () => number = Date.now,
): DetectionScanner;
```

**Implementation** (9 steps from the contract):
1. `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
2. Track the first non-null `total` observed in `enumerating` events (wrap `onProgress` to peek).
3. `const tracks = await enumerator.enumerate(request, signal, wrappedOnProgress);`
4. `const skippedLocalCount = (capturedTotal ?? tracks.length) - tracks.length;` (clamp to ≥ 0 — defensive against pathological inputs).
5. If `tracks.length === 0` → return empty `DetectionResult` (with the right `collectionKey`, `completedAt`, `skippedLocalCount`, zero counts, no `enriching`/`matching` events).
6. `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
7. `const slots = await enricher.enrich(tracks, signal, onProgress);`
8. `const enriched = slots.flatMap(s => s.kind === 'enriched' ? [s.track] : []); const unenrichedCount = slots.length - enriched.length;`
9. `if (signal.aborted) throw new DOMException('aborted', 'AbortError');`
10. `onProgress({ stage: 'matching', processed: 0, total: enriched.length });`
11. `const groups = detect(enriched);`
12. `onProgress({ stage: 'matching', processed: enriched.length, total: enriched.length });`
13. Assemble and return `DetectionResult` with all required fields per data-model §3.2.

`collectionKey` derivation: `request.kind === 'liked-songs'` → `'liked-songs'`; `request.kind === 'playlist'` → `request.playlistUri`.

**Tests** (`test/adapters/detection-scanner.test.ts`):
- Empty enumeration → empty result, no `enriching` or `matching` events.
- 1 group across 2 tracks → result has 1 group, correct `duplicateTrackCount: 2`, `removableTrackCount: 1`.
- Multiple groups → groups ordered by first-member position.
- Abort *before* `enumerate()` (signal pre-aborted) → throws `AbortError`, enumerator's `enumerate` never called (use a spy/fake that records calls).
- Abort *between* enumerate and enrich → enricher's `enrich` never called.
- Abort *during* enrich → no `matching` event emitted (track `onProgress` events).
- Enumerator throws `DetectionError('enumerator-failed')` → re-thrown unchanged; enricher never called.
- Enricher throws `DetectionError('rate-limit-unparseable')` → re-thrown unchanged.
- Determinism: same fakes + same input run twice → byte-equivalent `DetectionResult.groups`.
- Clock injection: pass `clock = () => 1234567890` → `result.completedAt === 1234567890`.
- `skippedLocalCount` derivation: `hostTotalLength: 100`, `tracks.length: 80` → `skippedLocalCount: 20`.
- `skippedLocalCount: 0` fallback when enumerator emits no `total` (e.g. single empty page).
- `unenrichedCount`: catalog returns `null` for 3 of 10 → result.unenrichedCount === 3.
- **Spot-check**: read the file contents; assert no string `'Spicetify'` or `'CosmosAsync'` appears (composition adapter must not couple to host).

**Files**:
- `src/adapters/detection-scanner.ts` (new, ~120 lines including JSDoc).
- `test/adapters/detection-scanner.test.ts` (new, ~280 lines).

## Test strategy

TDD per `DIRECTIVE_034`. Recommended order:
1. T011 first (fixture-driven; no dependencies beyond domain types).
2. T012 second (independent of T011 but mirrors the same patterns).
3. T013 last (consumes both fakes).

Coverage gate: 100% line + branch on all three new modules.

The composition adapter's test file should use fresh `FakeTracksEnumerator` + `FakeCatalogEnricher` instances per test case to avoid cross-test pollution.

## Definition of Done

- [ ] `src/adapters/fake-tracks-enumerator.ts`, `src/adapters/fake-catalog-enricher.ts`, `src/adapters/detection-scanner.ts` exist with JSDoc on every export.
- [ ] All three test files green at 100% line + branch.
- [ ] All abort positions (before / between / during) tested for the composition adapter.
- [ ] All error pass-through paths tested (enumerator throws, enricher throws).
- [ ] Determinism + clock injection tests present.
- [ ] Spot-check in `detection-scanner.test.ts` asserts no Spicetify reference in the file body.
- [ ] `npm run test:run` and `npm run typecheck` green.
- [ ] `test/architecture.test.ts` reports no violations.

## Risks

| Risk | Mitigation |
|---|---|
| Spot-check regex on Spicetify name causes false positives (e.g. import path mention in a comment) | Restrict the regex to import lines (`/from\s+['"][^'"]*spicetify/i`) — comments are allowed to reference the abstraction. |
| `skippedLocalCount` derivation is wrong when enumerator never emits `total` | Default to 0 when no total observed; document the fallback in JSDoc; explicit test case. |
| FakeTracksEnumerator emitting events synchronously in a tight loop blocks the event loop in tests | `await Promise.resolve()` at each page boundary yields control — sufficient for the cancellation race tests. |
| Force-mode flags mutually exclusive but the type doesn't enforce | Single optional `forceMode` field is a string-literal union, so the type system disallows multiple modes at once. |

## Reviewer guidance

- Confirm `createDetectionScanner` does not import `'spicetify'`, `'Spicetify'`, or `CosmosAsync`.
- Confirm the empty-collection short-circuit: no `enriching` or `matching` events emitted.
- Confirm abort positions (steps 1, 6, 9) are tested independently.
- Confirm `clock` injection is observable in `completedAt`.
- Confirm `skippedLocalCount` is derived from the first non-null `total` observed (not the final one — the spec pins this).

## Implementation command

```bash
spec-kitty agent action implement WP04 --agent <name>
```

## Activity Log

- 2026-06-10T09:23:28Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19293 – Assigned agent via action command
- 2026-06-10T14:15:32Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19293 – Moved to planned
- 2026-06-10T14:16:14Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=43177 – Started implementation via action command
- 2026-06-10T14:22:49Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=43177 – Ready for review
- 2026-06-10T14:23:28Z – claude:claude-sonnet-4-6:reviewer:reviewer – shell_pid=52422 – Started review via action command
- 2026-06-10T14:34:26Z – claude:claude-sonnet-4-6:reviewer:reviewer – shell_pid=52422 – Moved to planned
