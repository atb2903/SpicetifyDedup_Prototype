---
work_package_id: WP04
title: Spicetify removal adapter + uid capture + platform typings (live-verify)
dependencies:
- WP01
- WP03
requirement_refs:
- FR-003
- FR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-11T20:52:36Z'
subtasks:
- T012
- T013
- T014
- T015
history:
- timestamp: '2026-06-11T20:52:36Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/adapters/
execution_mode: code_change
owned_files:
- src/adapters/spicetify-removal-executor.ts
- src/adapters/spicetify-tracks-enumerator.ts
- src/types/spicetify-platform.d.ts
- test/adapters/spicetify-removal-executor.test.ts
- test/adapters/spicetify-tracks-enumerator.test.ts
tags: []
---

# WP04 — Spicetify removal adapter + `uid` capture + platform typings (live-verify)

## Objective

Build the production mutation adapter and the enumeration change that feeds it, gated on the
mandatory live-client verification this repo requires for any undocumented `Spicetify.Platform`
surface (`ADR-0011` precedent, memory `spec-kitty-live-verification-required`):

1. **Platform typings** — widen `src/types/spicetify-platform.d.ts` with `PlaylistAPI.remove`,
   `LibraryAPI.remove`, and the `uid` field on playlist items.
2. **`uid` capture** — `SpicetifyTracksEnumerator` reads `item.uid` for playlist items into
   `RawTrack.uid` (additive; Liked-Songs items stay `undefined`) — ADR-0012.
3. **`SpicetifyRemovalExecutor`** — implements the WP03 port: kind-dispatch, batching,
   partial-failure aggregation, progress, abort, host-availability guard.
4. **Live-client verification** — run the `research.md` §5 / `quickstart.md` checks against a
   real client and record the results in this WP **before it reaches `done`**.

100% line+branch on both adapters; `tsc --noEmit` green; the typings file is declaration-only.

## Context

This is the only file in the feature that touches the live host mutation API. The behavioral
contract and the live-verification dependency are authoritative — read first:

- [`../contracts/removal-executor-port.md`](../contracts/removal-executor-port.md) §Behavioral
  contract + §Live-verification dependency.
- [`../research.md`](../research.md) §1 (confirmed host primitives), §4 (batched partial-failure
  strategy), **§5 (mandatory live-verification items)**.
- [`../quickstart.md`](../quickstart.md) §Live-client verification — the exact console snippets.
- `src/adapters/spicetify-tracks-enumerator.ts` (existing) — the file you change in T013; mirror
  its injected-`platform` pattern, runtime-guard style, and `DetectionError` classification. The
  removal adapter (T014) follows the **same** injected-platform + lazy-`globalThis.Spicetify`
  shape so tests stub it.
- `src/types/spicetify-platform.d.ts` (existing) — the declaration file you widen in T012.
- `src/ports/removal-executor.ts` + `src/domain/removal-types.ts` + `src/domain/removal-errors.ts`
  (from WP01/WP03).

**Confirmed host primitives** (research §1, provisional until §5 live-verify):
- `Spicetify.Platform.LibraryAPI.remove({ uris: string[] })` → `Promise<void>` — Liked Songs.
- `Spicetify.Platform.PlaylistAPI.remove(playlistUri, { uri, uid }[])` → `Promise<void>` —
  playlists; `uid` disambiguates a repeated URI.

**Architectural constraint** (ADR-0001): `src/adapters/` imports `src/ports/` + `src/domain/`
only — never the store or UI. The runtime guard remains authoritative over the typings if the
live shape drifts.

## Branch strategy

Planning base & merge target: **`main`**. Workspace/branch assigned by
`spec-kitty agent action implement WP04 --agent <name>` from `lanes.json`. Depends on **WP01**
(types) and **WP03** (the port it implements).

## Subtasks

### T012 — Widen `spicetify-platform.d.ts` (`src/types/spicetify-platform.d.ts`) [P]

**Purpose**: Give `tsc` field-access checking for the new mutation calls + the `uid` item field.

**Changes** (additive to the existing `declare namespace Spicetify.Platform`):
- On `interface LibraryAPI`, add:
  ```ts
  /** Delete saved tracks by URI. URIs are unique in the saved set. (WP04, live-verified) */
  remove(param: { uris: string[]; silent?: boolean }): Promise<void>;
  ```
- Add an `interface PlaylistAPI` (new) with:
  ```ts
  /** Delete specific playlist occurrences by `{ uri, uid }`. (WP04, live-verified) */
  remove(playlistUri: string, tracks: { uri: string; uid: string }[]): Promise<void>;
  getContents(uri: string, params: { limit: number; offset: number }): Promise<{
    items: unknown[]; totalLength: number; offset: number; limit: number;
  }>;
  ```
  and `const PlaylistAPI: PlaylistAPI;` alongside the existing consts. (If `getContents` would
  duplicate an existing declaration elsewhere, reconcile — declare once; do not double-declare.)
- Update the file header note to mention WP04 widened it for removal; keep the "runtime
  validator remains authoritative if the live shape drifts" caveat.

**Validation**: `tsc --noEmit` green; declaration-only (no coverage). Do not change runtime code
here.

**Files**: `src/types/spicetify-platform.d.ts` (changed, +~15 lines).

### T013 — Capture `uid` in `SpicetifyTracksEnumerator` (`src/adapters/spicetify-tracks-enumerator.ts`)

**Purpose**: Carry the playlist item occurrence id into `RawTrack.uid` so `computeRemoveSet`
can address repeated-URI copies (ADR-0012). Additive — matching is untouched.

**Changes**:
- In `parseLibraryTrackItem(x, position)`: read `item['uid']`; if it is a non-empty string,
  set `uid` on the returned `RawTrack`; otherwise omit it (leave `undefined`). Liked-Songs
  items have no `uid`, so they naturally stay `undefined`. **Do not fabricate** a `uid`.
- Extend `LibraryTrackItem` with an optional `uid?: string` (documented: present for playlist
  items only). `isLibraryTrackItem` does **not** require `uid` (Liked Songs lack it) — leave the
  classifier's required fields unchanged.
- JSDoc: note the additive ADR-0012 capture and that the matching algorithm does not read `uid`.

**Tests** (`test/adapters/spicetify-tracks-enumerator.test.ts`, extend existing):
- A playlist item carrying `uid: 'abc'` → parsed `RawTrack.uid === 'abc'`.
- A playlist item with missing/empty `uid` → `RawTrack.uid === undefined` (no fabrication).
- A Liked-Songs item (no `uid`) → `RawTrack.uid === undefined`.
- The existing enumeration tests still pass (the change is additive); add `uid` assertions to
  at least one playlist-path fixture so the field flows end-to-end through a page.
- Re-confirm coverage stays 100% line+branch (the new branch — `uid` present vs absent — is
  covered).

**Files**: `src/adapters/spicetify-tracks-enumerator.ts` (changed, +~12 lines);
`test/adapters/spicetify-tracks-enumerator.test.ts` (changed, +~40 lines).

### T014 — `SpicetifyRemovalExecutor` (`src/adapters/spicetify-removal-executor.ts`, NEW)

**Purpose**: The production `RemovalExecutor` — translate a `RemovalTarget` + `TrackRef[]` into
batched host `remove` calls and aggregate the per-track outcome (FR-010 / AS-8 / NFR-002).

**Design** (contract §Behavioral contract + research §4), mirroring the enumerator's
injected-platform pattern:
- **Injected platform interface** (constructor param, lazy `globalThis.Spicetify.Platform`
  fallback for production — same shape as `TracksEnumeratorPlatform`):
  ```ts
  export interface RemovalExecutorPlatform {
    LibraryAPI: { remove(param: { uris: string[] }): Promise<void> };
    PlaylistAPI: { remove(playlistUri: string, tracks: { uri: string; uid: string }[]): Promise<void> };
  }
  ```
- **`BATCH_SIZE`** — a tuned numeric constant (start at **100**, finalize after the §5 live
  atomicity check). It is a numeric bound → boundary-test at `BATCH_SIZE − 1`, `BATCH_SIZE`,
  `BATCH_SIZE + 1` total tracks, plus the empty case.
- **`remove(target, tracks, signal, onProgress)`**:
  1. **Host-availability guard**: if the needed API/method is absent → throw
     `RemovalError('host-unavailable', …)` **before any mutation**.
  2. If `tracks.length === 0` → return `{ removed: [], failed: [] }` without a host call.
  3. Split `tracks` into batches of `BATCH_SIZE`, preserving order (no re-order, no dedup).
  4. For each batch: check `signal.aborted` → throw `DOMException('…','AbortError')` if set;
     dispatch by `target.kind`:
     - `liked-songs` → `LibraryAPI.remove({ uris: batch.map(t => t.uri) })` (`uid` ignored).
     - `playlist` → `PlaylistAPI.remove(target.playlistUri, batch.map(t => ({ uri: t.uri, uid: t.uid! })))`.
       Playlist refs are guaranteed a `uid` by `computeRemoveSet`; still assert/guard so a
       missing `uid` fails loud rather than silently passing `undefined`.
  5. On batch fulfilment → add the batch's tracks to `removed`; call
     `onProgress?.({ removedSoFar: removed.length, total: tracks.length })`.
  6. On batch rejection → add the batch's tracks to `failed` with
     `{ track, reason: <rejection message> }`, and **continue** with the remaining batches
     (do not abort the whole operation).
  7. Return `{ removed, failed }` with `removed.length + failed.length === tracks.length`.
- **Do not** route anything through the public Web API (C-005 / ADR-0011) — Platform only.
- The optional Liked-Songs `LibraryAPI.contains(...)` reconciliation (research §4) is an
  enhancement gated on §5; **not** in scope for v1 unless §5 shows bulk `remove` is atomic and
  the reconciliation is needed — document the decision in the ADR (WP07/T026), do not build it
  speculatively here.

**Tests** (`test/adapters/spicetify-removal-executor.test.ts`, NEW) — drive a **stub platform**
(no real host):
- `liked-songs` happy path → calls `LibraryAPI.remove({ uris })` with the batch URIs; `uid`
  never forwarded; outcome all-removed.
- `playlist` happy path → calls `PlaylistAPI.remove(playlistUri, [{ uri, uid }])`; outcome
  all-removed.
- **Batching boundary**: total tracks at `BATCH_SIZE − 1` (one batch), `BATCH_SIZE` (one
  batch), `BATCH_SIZE + 1` (two batches), and `0` (no host call) — assert the number of host
  calls and the batch sizes.
- **Partial failure**: a stubbed `remove` that rejects for the 2nd batch only → that batch's
  tracks in `failed` with the reason; the rest in `removed`; `removed + failed === total`;
  remaining batches still attempted.
- **Host-unavailable**: platform missing `LibraryAPI`/`PlaylistAPI` (or the `remove` method)
  → throws `RemovalError('host-unavailable')` before any call.
- **Abort**: `signal` aborted before the 2nd batch → throws `AbortError`; assert no further
  host calls after the abort point.
- **Order preserved**: tracks are passed to the host in the order received (no re-order/dedup).
- **Playlist ref missing `uid`** → fails loud (guard), not silent `undefined`.
- 100% line + branch.

**Files**: `src/adapters/spicetify-removal-executor.ts` (new, ~150 lines);
`test/adapters/spicetify-removal-executor.test.ts` (new, ~220 lines).

### T015 — Live-client verification (MANDATORY DoD)

**Purpose**: Confirm the undocumented host shapes against a real Spotify client before this WP
can reach `done` (memory `spec-kitty-live-verification-required` — skipping this has shipped a
CRITICAL defect in this repo before). **This is a human-in-the-loop gate**: the implementing
agent must surface these checks and the reviewer must confirm the recorded results before
approval; do not let WP04 reach `done` on green unit tests alone.

**Run** (in the Spotify DevTools console, against a throwaway test playlist + a few disposable
liked songs — see `quickstart.md` §Live-client verification for the exact snippets):
1. `LibraryAPI.remove({ uris:[…] })` resolves for a valid small Liked-Songs removal;
   `LibraryAPI.contains(uri)` reflects the removal.
2. `PlaylistAPI.getContents(testUri,…)` returns items carrying `uid`; removing **one**
   occurrence's `uid` deletes that copy and **keeps** the other (the keep-earliest mechanism).
3. **Atomicity**: a bulk `remove` with one stale/invalid member — does it reject the whole call
   or drop-and-continue? Record the answer; it finalizes `BATCH_SIZE` and whether a per-track
   fallback is needed (research §4).
4. **Stale handling (A-5)**: removing an already-absent `uid`/URI — no-op or error? Confirms
   the A-5 assumption.
5. **Client UI sync**: confirm the host updates its own UI/cache after `remove` so the in-client
   `applyRemovalOutcome` refresh (WP05) does not fight it.

**Record** the results (date, client version, observed behavior per item, and any shape drift)
in this WP's Activity Log. If the live shape drifts from the community type defs, correct the
runtime guard + typings (T012) and append an ADR note (the ADR lands in WP07/T026). Set
`BATCH_SIZE` in T014 from the atomicity finding.

**Files**: none (verification notes recorded in this WP's Activity Log / the ADR draft).

## Test strategy

TDD (`DIRECTIVE_034`) for T013/T014: failing test first against the stub platform, watch it
fail, implement. happy-dom not required (adapters are DOM-free). Coverage gate: 100% line+branch
on both `.ts` adapters; the `.d.ts` typings emit no code. The live verification (T015) is a
manual gate, not an automated test — but it is a hard DoD item per the charter Risk Boundaries
and this repo's verification memory.

## Definition of Done

- [ ] Typings declare `LibraryAPI.remove` / `PlaylistAPI.remove` / playlist-item `uid`; `tsc`
      green; runtime guard noted as authoritative.
- [ ] Enumerator captures playlist `uid` into `RawTrack.uid` (additive; never fabricated;
      Liked-Songs stays `undefined`); matching untouched; coverage stays 100%.
- [ ] `SpicetifyRemovalExecutor` implements the port: kind-dispatch, batching at `BATCH_SIZE`,
      partial-failure aggregation (`removed + failed === total`), progress, abort between
      batches, host-availability guard; order preserved; Platform-only (no Web API).
- [ ] Adapter tests cover batching boundaries, partial failure, host-unavailable, abort, order,
      and the missing-`uid` guard; 100% line+branch.
- [ ] **Live-client verification (T015) run and recorded** in the Activity Log; `BATCH_SIZE`
      finalized from the atomicity result; any shape drift reflected in the typings/guard.
- [ ] `npm run test:run` and `tsc --noEmit` green; architecture test clean; no store/UI imports.

## Risks

| Risk | Mitigation |
|---|---|
| Host shape drift from the community type defs | Runtime guard is authoritative (ADR-0011 pattern); T015 live-verify confirms the real shapes before merge. |
| Bulk `remove` atomicity unknown | T015 §3 resolves it; drives `BATCH_SIZE` + per-track fallback decision before the adapter lands. |
| Silent `undefined` `uid` reaching `PlaylistAPI.remove` | Guard in T014 fails loud; `computeRemoveSet` already enforces it upstream; test covers the guard. |
| Skipping live verification (repo has shipped a defect this way) | T015 is a hard, human-confirmed DoD item; reviewer must see recorded results before approval. |

## Reviewer guidance

- Verify kind-dispatch matches the contract: Liked Songs by `{ uris }`, playlists by
  `{ uri, uid }`; `uid` never forwarded to `LibraryAPI`.
- Verify partial failure continues to remaining batches and accounts for every track.
- Verify the host-availability guard precedes any mutation, and abort is not swallowed.
- **Do not approve until the T015 live-verification results are recorded** and `BATCH_SIZE` is
  justified by the atomicity finding.
- Confirm no public-Web-API path and no store/UI imports.

## Implementation command

```bash
spec-kitty agent action implement WP04 --agent <name>
```

## Activity Log
