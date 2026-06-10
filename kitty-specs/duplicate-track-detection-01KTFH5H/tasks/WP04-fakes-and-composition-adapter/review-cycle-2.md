---
affected_files:
  - src/adapters/detection-scanner.ts
  - src/domain/detection-errors.ts
  - src/domain/duplicate-detector.ts
  - test/adapters/detection-scanner.test.ts
cycle_number: 2
mission_slug: duplicate-track-detection-01KTFH5H
reproduction_command: "cd .worktrees/duplicate-track-detection-01KTFH5H-lane-d && npm run test:coverage"
reviewed_at: '2026-06-10T14:26:00Z'
reviewer_agent: claude:claude-sonnet-4-6:reviewer:reviewer
verdict: rejected
wp_id: WP04
---

## Summary

The three WP04-owned adapter files are well-implemented and correct. The architecture test passes; the Spicetify spot-check passes; TypeScript compiles cleanly; all 514 tests pass. However, two blocking issues prevent approval:

1. **Coverage gate failure** — `npm run test:coverage` exits with errors because files added by WP04 that belong to upstream WPs (WP01, WP02) are not fully covered.
2. **Untested branch in WP04-owned `detection-scanner.ts` line 76** — the `event.total === null` arm of the `enumerating` progress event filter is never exercised.

---

## Issue 1 — Files outside WP04's `owned_files` are added and incompletely covered (BLOCKING)

**What happened**: WP04 added files that are owned by WP01 and WP02:
- `src/domain/detection-errors.ts` (WP01-owned)
- `src/domain/detection-types.ts` (WP01-owned)
- `src/domain/duplicate-detector.ts` (WP02-owned)
- `src/domain/duplicate-key.ts` (WP02-owned)
- `src/ports/catalog-enricher.ts` (WP03-owned)
- `src/ports/detection-scanner.ts` (WP03-owned)
- `src/ports/tracks-enumerator.ts` (WP03-owned)

WP01 and WP03 are already `approved`; WP02 is `in_review` in lane-b.

**Why it matters**: The global coverage threshold is 100% line + branch. The coverage report shows:
- `src/domain/detection-errors.ts`: 62.5% statements, 50% branches — lines 49, 52–65 uncovered (the `options.cause` and `options.context` constructor branches, plus `isDetectionError`).
- `src/domain/duplicate-detector.ts`: 65.27% statements, 55.88% branches — multiple algorithm paths uncovered (e.g., lines 130–140, 145, 173, 188 per the coverage report).

This causes `npm run test:coverage` to fail with:
```
ERROR: Coverage for lines (92.64%) does not meet global threshold (100%)
ERROR: Coverage for branches (93.54%) does not meet global threshold (100%)
```

**How to fix**:
- **Option A (preferred)**: Remove the domain and port files from WP04's commit. These files should come from the WP01/WP02/WP03 lane merges. Since this lane diverges from the mission branch before those WPs landed, ask the orchestrator to rebase lane-d onto the merged WP01 + WP02 + WP03 commits so the owned files are inherited. Then re-implement WP04 using the inherited types.
- **Option B (acceptable if rebase is not possible)**: Keep the domain/port files in this lane but add the missing tests for the uncovered paths in `detection-errors.ts` and `duplicate-detector.ts`, bringing them to 100% line + branch. In particular:
  - `detection-errors.ts`: test the `options.cause` path, the `options.context` path, and `isDetectionError`.
  - `duplicate-detector.ts`: add tests for the name+artist+duration match paths, the multi-group scenarios, and the solo track insertion branches that are currently uncovered. These should include the boundary tests (1999 / 2000 / 2001 ms) mandated by WP02's spec.

---

## Issue 2 — Branch miss in WP04-owned `detection-scanner.ts` line 76 (BLOCKING)

**Location**: `src/adapters/detection-scanner.ts`, line 76:
```ts
if (event.stage === 'enumerating' && event.total !== null) {
```

**What's missing**: The `event.total === null` branch is never entered in any test. `FakeTracksEnumerator` always emits `total: this.hostTotalLength` (always a number). No test exercises the case where the enumerating stage emits `total: null`.

This leaves a branch miss in a WP04-owned file, which the coverage report flags as `95.23%` branch coverage for `src/adapters/detection-scanner.ts`.

**How to fix**: Add a test in `test/adapters/detection-scanner.test.ts` that drives a custom enumerator (or a `FakeTracksEnumerator` variant) which emits `{ stage: 'enumerating', processed: N, total: null }`. Verify that `skippedLocalCount` falls back to `0` in this case (the existing `skippedLocalCount=0 fallback` test uses an empty enumerator with no events at all, so it does not exercise the `total: null` code path).

Example test sketch:
```ts
it('skippedLocalCount=0 when enumerating event has total=null', async () => {
  // Custom enumerator that emits total:null
  const nullTotalEnumerator: TracksEnumerator = {
    async enumerate(_req, _sig, onProgress) {
      await Promise.resolve();
      onProgress({ stage: 'enumerating', processed: 5, total: null });
      return makeTracks(5);
    },
  };
  const tracks = makeTracks(5);  // same 5 tracks
  const catalog = buildCatalog(tracks);
  const scanner = createDetectionScanner(
    nullTotalEnumerator,
    new FakeCatalogEnricher({ catalog }),
  );
  const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
  expect(result.skippedLocalCount).toBe(0);
});
```

---

## Non-blocking observations (no action required)

- The WP04-owned adapter files (`fake-tracks-enumerator.ts`, `fake-catalog-enricher.ts`, `detection-scanner.ts`) are correctly implemented and well-documented.
- All abort positions (before / between / during) are tested.
- Clock injection, determinism, `unenrichedCount`, `scannedTrackCount`, `collectionKey` derivation, and error pass-through are all tested correctly.
- The Spicetify spot-check test correctly restricts the regex to import lines and passes.
- JSDoc is present on every export.
- Architecture test reports no violations.
