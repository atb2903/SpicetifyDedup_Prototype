---
work_package_id: WP04
title: Adapter playlist-v2 Acceptance
dependencies: []
requirement_refs:
- FR-010
- FR-011
- NFR-010
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-dedup-page-live-client-polish-01KT6ZCR
base_commit: 497a812dcfef5739a052f84728f45ae753c10d29
created_at: '2026-06-03T20:34:09.585956+00:00'
subtasks:
- T022
- T023
- T024
- T025
- T026
shell_pid: "221378"
agent: "claude:opus-4-7:implementer:implementer"
history:
- timestamp: '2026-06-03T19:01:12Z'
  actor: tasks-generator
  note: Initial work package created from plan.md WP-04 (P4 playlist-v2 acceptance).
authoritative_surface: src/adapters/spicetify-playlists-loader
execution_mode: code_change
mission_slug: dedup-page-live-client-polish-01KT6ZCR
owned_files:
- src/adapters/spicetify-playlists-loader.ts
- test/adapters/spicetify-playlists-loader.test.ts
- test/adapters/fixtures/rootlist-response.sample.json
priority: P4-LOW
tags: []
---

# WP-04 — Adapter `playlist-v2` Acceptance

**Closes**: spec §1 P4 (LOW) — "`data-model.md` §3 declares `'playlist'` and `'playlist-v2'` both valid rootlist types; the adapter at `src/adapters/spicetify-playlists-loader.ts:141` matches only `'playlist'`."
**Requirements**: FR-010 (adapter accepts both URI types), FR-011 (fixture covers `playlist-v2`), NFR-010 (no half-done direction — adapter widens, prior data-model stays).
**Acceptance test (independent)**: a fixture node typed `playlist-v2` appears in the adapter's output as a `RawCollection` with structurally identical fields to a `playlist` node. Existing `playlist` rows still pass; `show`, `episode`, and hypothetical `playlist-v3` are still silently skipped.

This is the smallest WP in the mission — one branch widening + one fixture extension + a small number of tests. It closes the silent-failure path that DRIFT-1 surfaced in the prior mission review. Zero observed user impact in the 2026-06-03 library, but the regression risk for a future Spotify rollout is non-zero.

---

## Branch Strategy

- **Planning base / merge target**: `get_library`.
- **This lane's workspace and branch**: assigned by `finalize-tasks` (see `lanes.json`).
- **Merge cadence**: lane merges back to `get_library` on done. No merges to `main` from this mission.

---

## Context — what changes

`src/adapters/spicetify-playlists-loader.ts:141` currently has:
```ts
if (type === 'playlist') {
  out.push(this.toRawCollection(node));
  continue;
}
```

After this WP:
```ts
if (type === 'playlist' || type === 'playlist-v2') {
  out.push(this.toRawCollection(node));
  continue;
}
```

The downstream `toRawCollection` is unchanged because spec assumption §6.4 holds that `'playlist-v2'` carries the same fields as `'playlist'`. T022's live probe + T023's fixture test confirm the assumption holds before the one-line code change lands.

**Note on F-3 boundary case** (`playlist-v3` — a hypothetical future type): the adapter still silently skips it. This confirms the widening is *specific* (two named types) rather than *broad* (anything playlist-like).

---

## Subtasks

### T022 — Live probe: observed rootlist `type` distribution (informational)

**Purpose**: confirm the 2026-06-03 measurement (zero `playlist-v2` nodes) and inform the fixture choice.

**Steps**:
1. Open Spotify, navigate to the Dedup page, open DevTools.
2. Paste the snippet from research.md §5 (live-probe checkpoint).
3. Record the output: list of observed types + counts.
4. Capture the result into the WP's working notes.

**Outcome interpretation**:
- **Zero `playlist-v2` nodes observed (expected)**: the synthetic fixture node from data-model §3 is the only test-side artifact. FR-010 stands; SC-4 verification is fixture-only.
- **One or more `playlist-v2` nodes observed (surprise)**: capture one real node as an additional fixture (anonymized — strip uri-specific content if user-sensitive). The synthetic node still ships per data-model §3.

**Validation**: notes capture the observed distribution; fixture choice in T024 reflects the observed result.

---

### T023 — Failing fixture test: `playlist-v2` node appears in adapter output (F-1, F-2)

**Purpose**: encode FR-010 + FR-011 as a failing test on the current adapter.

**File**: `test/adapters/spicetify-playlists-loader.test.ts` (existing — extend).

**Steps**:
1. Add new test cases:
   - `it('FR-010 / F-1 — adapter emits a RawCollection for playlist-v2 rootlist nodes', …)`. Load the (about-to-be-extended) fixture, assert the adapter's output includes a `RawCollection` whose `uri` matches the `playlist-v2` node's uri.
   - `it('FR-010 / F-2 — RawCollection for playlist-v2 has structurally identical fields to playlist', …)`. Run two synthetic nodes (one `'playlist'`, one `'playlist-v2'`) with identical other fields through the adapter; assert the two output `RawCollection` objects have the same shape (modulo uri).
2. Run — must fail (T024 has not extended the fixture yet OR the adapter still rejects `'playlist-v2'`).

**Validation**: failure mode is clear and non-flaky. Capture the failure output in the commit message (NFR-001).

**Note**: F-1 fails because of the adapter; F-2 may fail because of the adapter too. Order T023 before T024 so the failing test exists before the fixture extension; that way the test is genuinely red against the un-extended fixture.

Alternative (acceptable): write the F-1/F-2 tests inline with hand-built JSON inputs (no fixture file required) so the tests are self-contained. Then T024's fixture extension makes the "load the captured fixture" assertion also pass. The WP chooses whichever shape gives a cleaner red-then-green cycle.

---

### T024 — Extend `rootlist-response.sample.json` (FR-011)

**Purpose**: add one `playlist-v2` node to the canonical fixture (Path A from contract §2 — lower churn).

**File**: `test/adapters/fixtures/rootlist-response.sample.json` (existing — extend).

**Content**: insert one node matching contract §2 / data-model §3:
```json
{
  "type": "playlist-v2",
  "uri": "spotify:playlist:v2-fixture-1",
  "name": "Future-rollout Playlist",
  "owner": { "displayName": "me" },
  "isOwnedBySelf": true,
  "canAdd": true,
  "canRemove": true,
  "totalLength": 7,
  "images": [{ "url": "https://example.com/cover.png" }],
  "collaborators": { "count": 0 }
}
```

**Steps**:
1. Open the existing fixture, identify where rootlist `items[]` ends.
2. Insert the new node as one additional entry.
3. If any existing test asserts an exact `items.length` or exact uri array, update those assertions to reflect the +1 row.
   - If the diff churn is large (>10 lines of assertion updates), fall back to **Path B** (sibling fixture `rootlist-response.with-v2.sample.json`) per contract §2. Note the choice in the commit message.

**Validation**: fixture parses as valid JSON; existing tests that load it still pass after their +1 assertion updates.

---

### T025 — Adapter: widen `walkItems` branch

**Purpose**: ship the one-line code change.

**File**: `src/adapters/spicetify-playlists-loader.ts` (existing — minor edit at line 141).

**Steps**:
1. Find the existing branch:
   ```ts
   if (type === 'playlist') {
     out.push(this.toRawCollection(node));
     continue;
   }
   ```
2. Widen to:
   ```ts
   if (type === 'playlist' || type === 'playlist-v2') {
     out.push(this.toRawCollection(node));
     continue;
   }
   ```
3. Update the file's JSDoc (the `walkItems` documentation block) to reflect the widened acceptance set (NFR-008).
4. Re-run T023's tests — green.

**Architecture compliance**: edit is contained to `src/adapters/`. No new imports.

---

### T026 — Boundary tests F-3, F-4, F-5

**Purpose**: confirm the widening is specific (two named types) and existing behavior holds elsewhere.

**File**: `test/adapters/spicetify-playlists-loader.test.ts` (existing — extend).

**Steps**:
1. `it('F-3 — playlist-v3 (hypothetical) is still silently skipped', …)`. Construct a fixture with one `'playlist-v3'` node; assert it does NOT appear in the adapter's output.
2. `it('F-4 — show and episode nodes are still silently skipped', …)`. Same shape, with `'show'` and `'episode'` types.
3. `it('F-5 — folder containing a playlist-v2 child surfaces the child in the flattened result', …)`. Construct a `'folder'` whose `items[]` contains one `'playlist-v2'` node; assert the v2 node appears in the flattened output (folder recursion is unchanged).

**Validation**: all three boundary tests pass; coverage at 100/100.

**Note**: F-3 is the explicit guard against a "anything playlist-like" misimplementation. A reviewer should be able to read this test and see the widening is by exact match, not pattern.

---

## Definition of Done

This WP is done when **all** of the following hold:

1. T022 probe captured in WP working notes.
2. T023 failing tests written and observed failing on the un-fixed tree, then green after T024 + T025.
3. T024 fixture extension committed; existing tests' `+1 row` assertions updated if needed.
4. T025 adapter widening committed.
5. T026 boundary tests written and green.
6. `npm run test:run` exits 0.
7. `npm run typecheck` exits 0.
8. `npm run test:coverage` reports `lines: 100%` and `branches: 100%`.
9. Architecture test green.
10. JSDoc on `walkItems` reflects the widened acceptance set (NFR-008).
11. Per NFR-001: failing-test commits precede fix commit.
12. **NFR-010 alignment**: the adapter widens (this WP) AND `data-model.md` §3 of the prior mission stays unchanged (was already correct). No half-done direction.

The implementing agent runs the spec-kitty handoff commands so the lane state advances and review begins.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Existing `spicetify-playlists-loader.test.ts` asserts exact fixture contents | If the diff churn from extending the canonical fixture exceeds ~10 lines, fall back to Path B (sibling fixture). Note in commit. |
| `playlist-v2` carries divergent fields (assumption §6.4 false) | T022's live probe escalates if observed; if confirmed, capture a real `playlist-v2` node, adjust `toRawCollection` to handle divergent fields, and update data-model §3. The WP scope grows by one subtask. |
| Reviewer expects `Spicetify.URI.fromString` adoption | Spec §7 explicitly out of scope. Cite the spec line in the PR description if challenged. |
| F-3 wording suggests "playlist-anything is fine" | The boundary test is the safeguard. Reviewer enforces. |

---

## Reviewer Guidance

A reviewer should check:

1. **NFR-001**: failing-test commit precedes fix commit.
2. **NFR-010**: the adapter widens (FR-010 path); `data-model.md` §3 of the prior mission (`kitty-specs/load-dedupable-playlists-01KT3XW3/data-model.md`) is unchanged. No half-done.
3. **F-3 boundary test present**: the widening is by exact match (`'playlist' || 'playlist-v2'`), not regex or `startsWith`.
4. **Fixture extension** chosen path (A or B) documented in the commit message.
5. **JSDoc** on `walkItems` reflects the new acceptance set (NFR-008).
6. **Coverage**: 100/100 (NFR-002).
7. **No new imports** in `spicetify-playlists-loader.ts` (architecture test green).

---

## Out of Scope (do NOT do in this WP)

- Adopting `Spicetify.URI.fromString` for type classification (spec §7).
- Restructuring the adapter's URI-type handling beyond the one-line widening.
- Changing `toRawCollection`'s field mapping (unless T022/T023 reveal divergent fields — escalates the WP scope).
- Amending the prior mission's `data-model.md` (NFR-010 forbids the half-done shape).
- Changes to `fake-playlists-loader.ts` (it's a port-level fake; its fixture is independent).

## Activity Log

- 2026-06-03T20:34:10Z – claude:opus-4-7:implementer:implementer – shell_pid=221378 – Assigned agent via action command
