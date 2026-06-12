# Quickstart — Remove Duplicate Tracks Button

**Mission**: remove-duplicate-tracks-button-01KTW64K · **Date**: 2026-06-11

End-to-end story for a developer picking up this mission, and the live-client
verification the removal adapter requires before it can land.

## The flow (what we're building)

1. User clicks a row's dedup button → existing scan runs → row reaches `loaded` with a
   `DetectionResult`.
2. Because `removableTrackCount > 0`, `RemoveDuplicatesButton` appears under the summary
   (FR-001/FR-002).
3. User clicks it → `store.requestRemoval(key)` → FSM `loaded.removal: none → confirming`
   → `RemovalConfirmDialog` (step 1) names the collection and exact count (FR-005).
4. User confirms → `store.confirmRemoval(key)`:
   - if `removableTrackCount > 25` → `confirming2`, dialog step 2 (FR-006); confirm again;
   - `computeRemoveSet(result, target)` → `RemovalExecutor.remove(...)` →
     `applyRemovalOutcome(result, outcome, target)` → dispatch `removeComplete`.
5. Row refreshes in-client (FR-008): removed groups gone, count reduced, button hides at
   zero (AS-7); on partial failure, `RemovalOutcomeView` reports it and unremoved copies
   stay visible (FR-010/AS-8). No re-scan (FR-009).

## Pure-domain dev loop (no host, no DOM)

```bash
npm run test -- remove-set apply-removal-outcome detection-state
```

TDD order (failing test first, per `DIRECTIVE_034`):
1. `remove-set.ts` — `isRemovableResult` + `computeRemoveSet` (keep-earliest, size
   invariant, playlist-uid requirement, fail-loud). Boundary: group of 2, group of N,
   missing uid, empty.
2. `apply-removal-outcome.ts` — full success / partial / empty / all-failed /
   outcome-mismatch. Assert `removableTrackCount` recompute and group collapse.
3. `detection-state.ts` — every FSM cell (data-model §5.1), 24/25/26 branch on
   `confirmFirst`, reference-equality on ignored cells.

## Store + UI loop (happy-dom + FakeRemovalExecutor)

```bash
npm run test -- detection-store RemoveDuplicatesButton RemovalConfirmDialog RemovalOutcomeView
```

Drive the store with `FakeRemovalExecutor` scripted to return success, partial, and a
throw. Assert: single-collection scope (executor called with exactly the acted target),
concurrency lock (a second `requestRemoval` during `removing` is a no-op), no-auto-run
(no executor call without `confirmRemoval`), and the >25 two-step path.

## Full gate

```bash
npm run typecheck   # tsc --noEmit, strict
npm run test        # vitest, 100% line/branch on new modules
npm run test -- architecture   # import-boundary rules incl. new files
```

## Live-client verification (MANDATORY DoD for the adapter WP)

Per `research.md` §5 and memory `spec-kitty-live-verification-required`, before the
`SpicetifyRemovalExecutor` WP reaches `done`, run these in the Spotify DevTools console
against a throwaway test playlist / a few disposable liked songs and record results in
the WP:

```js
// Liked Songs — unique URIs
await Spicetify.Platform.LibraryAPI.remove({ uris: ['spotify:track:XXent'] });
await Spicetify.Platform.LibraryAPI.contains('spotify:track:XXent'); // expect [false]

// Playlist — occurrence by uid (duplicate the same track first)
const c = await Spicetify.Platform.PlaylistAPI.getContents('spotify:playlist:TEST', { limit: 50, offset: 0 });
// pick one occurrence's uid, leave the other:
await Spicetify.Platform.PlaylistAPI.remove('spotify:playlist:TEST', [{ uri: c.items[i].uri, uid: c.items[i].uid }]);
```

Confirm: (1) both calls resolve; (2) removing one playlist `uid` keeps the other copy;
(3) a bulk call with a stale/invalid member — atomic reject or drop-and-continue? (sets
`BATCH_SIZE` / per-track fallback, §4); (4) the client UI updates itself after `remove`
(so our in-client refresh doesn't fight it). If the live shapes drift from the community
type defs, the adapter's runtime guard + typings are corrected (ADR-0011 pattern) and an
ADR note is appended.

## ADRs to write (`DIRECTIVE_003`)

- ADR-0012 — capture playlist `uid`; A-3 deviation.
- ADR-0013 — removal sub-state on the detection `loaded` state (vs. separate store).
- ADR-0014 — `RemovalExecutor` port + batched partial-failure strategy + live-verify dep.
