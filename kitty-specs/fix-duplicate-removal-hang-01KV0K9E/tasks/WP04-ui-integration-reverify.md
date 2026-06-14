---
work_package_id: WP04
title: Stalled UI message, integration test & live re-verification
dependencies:
- WP03
- WP05
requirement_refs:
- FR-002
- FR-003
- FR-006
- FR-008
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T18:51:29Z'
subtasks:
- T012
- T013
- T014
agent: "claude:opus:reviewer:reviewer"
shell_pid: "104928"
history:
- timestamp: '2026-06-13T18:51:29Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/ui/
execution_mode: code_change
owned_files:
- src/ui/RemovalOutcomeView.tsx
- src/ui/RemovalOutcomeView.module.scss
- test/ui/RemovalOutcomeView.test.tsx
- test/integration/removal-termination.test.ts
- kitty-specs/fix-duplicate-removal-hang-01KV0K9E/reverify-evidence.md
tags: []
---

# WP04 — Stalled UI message · integration test · live re-verification

## Objective

Close the mission: surface the stall to the user in plain language (NFR-004), prove the
termination guarantee end-to-end through the real store (DIRECTIVE_036), and re-verify the whole
flow live on the 2-song repro (SC-001..SC-004).

Three deliverables:

1. **`RemovalOutcomeView`** renders a "timed-out" message when the outcome is a stall, keeping the
   generic partial copy otherwise.
2. **Integration test** drives the **real** store + **real** enricher and asserts **both**
   guarantees: (a) a duplicate carrying a host `uid` is *actually removed* on the happy path (proves
   Defect B / WP05 fixed — `computeRemoveSet` no longer throws and `PlaylistAPI.remove` is reached);
   and (b) a `FakeRemovalExecutor` `hang` + fake scheduler *terminates* to `partial` with truthful
   counts and no false success (proves Defect A + ceiling / WP03).
3. **Live re-verification** transcript captured into `reverify-evidence.md`.

## Context — read first

- [`../contracts/removal-termination.md`](../contracts/removal-termination.md) — the seven
  post-conditions; "Plain-language UI (NFR-004)" describes the timed-out copy.
- [`../quickstart.md`](../quickstart.md) Step 3 — the live re-verification recipe (SC-001..SC-004).
- `src/ui/RemovalOutcomeView.tsx` — the current pure-props leaf; mounted by
  `src/ui/DetectionLoadedSummary.tsx:240` only when `removal.phase === 'partial'`.
- WP03's all-failed outcome — each `failed[].reason` carries a `stalled:` prefix for a stall; the
  view detects the stall from that.
- `test/integration/detection-end-to-end.test.ts` — the house style for an integration test
  driving the real store.

## Subtasks

### T012 — Plain-language timed-out copy in `RemovalOutcomeView`

**Purpose.** Distinguish a *stall* from an ordinary partial failure with human-readable copy and no
raw stack/exception text (NFR-004).

**Steps.**

1. In `RemovalOutcomeView.tsx`, derive `isStalled` from the outcome: every `failed[].reason`
   begins with `stalled:` (an all-failed stall outcome). Keep it a pure derivation over props — no
   store, no new import beyond `removal-types`.
2. When `isStalled`, render the timed-out message, e.g.:
   *"Removal timed out — no tracks were removed. You can try again."* (role="status" preserved).
   Otherwise render the existing partial-failure message unchanged.
3. Optionally add a SCSS hook in `RemovalOutcomeView.module.scss` if the timed-out state needs a
   distinct visual affordance — keep it minimal; no raw error text in the primary message.
4. The Remove button remains visible in `partial` for retry (existing `DetectionLoadedSummary`
   behavior) — confirm the stall path keeps that (FR-008). No change needed if it already does.

**Test (`test/ui/RemovalOutcomeView.test.tsx`).** Two branches at 100% coverage: (a) a generic
partial outcome (mixed `failed` reasons / non-`stalled`) → the existing copy; (b) an all-`stalled`
outcome → the timed-out copy. Assert `role="status"` and that no stack/`RemovalError` text leaks.

### T013 — Integration test: termination guarantee (DIRECTIVE_036)

**Purpose.** Prove the invariant from the contract through the **real** store, not a unit mock.

**Steps.**

1. Create `test/integration/removal-termination.test.ts`.
2. **Happy path (Defect B — WP05 proof).** Build the pipeline through the **real enricher**: feed
   `RawTrack`s for a playlist duplicate group where each member carries a host `uid` (mirror the live
   shape, e.g. `uid: '610a666b423c78e4'`), run them through the real `InlineCatalogEnricher` + the
   real detector so the `loaded` result's group members carry `uid`. Wire
   `createDetectionStore(scanner, new FakeRemovalExecutor({ kind: 'ok' }), fakeScheduler)`, drive the
   row to `removing`, flush. Assert: `computeRemoveSet` did **not** throw, the executor **recorded a
   `remove` call whose `TrackRef` carries the `uid`** (the request reached the seam with the
   occurrence id), the row reaches a **success** terminal state (`none`), and the duplicate count
   drops by one. This is the regression guard that the enricher fix actually unblocks removal — it
   would fail against the pre-WP05 enricher (`computeRemoveSet` throwing).
3. **Stall path (Defect A + ceiling — WP03 proof).** Wire the real store with
   `new FakeRemovalExecutor({ kind: 'hang' })` + a fake scheduler, drive a `loaded` row with one
   duplicate (valid `uid`) to `removing`, advance the scheduler past `STALL_CEILING_MS`, flush.
   Assert: row leaves `removing` → `partial`; `result.removableTrackCount` unchanged (nothing
   removed); the row is **never** `none` (no false success — FR-007); the executor recorded the
   `hang` call (the request reached the seam).
4. Both paths must use the **real** `createDetectionStore` and real enricher (black-box,
   DIRECTIVE_036) — not a mocked `confirmRemoval`.

### T014 — Live re-verification (SC-001..SC-004 / C-004)

**Purpose.** Confirm the fix on the real client. Driver protocol — you run build/push/restart; the
user clicks; capture the transcript into `reverify-evidence.md`.

**Steps.**

1. Rebuild and push: `npm run build-local` → copy `dist/` into the Spicetify app folder →
   `spicetify apply` / restart.
2. On the 2-song repro, click **Remove**:
   - exactly **one** copy removed, UI reaches **success**, no spinner-forever (SC-001); repeat
     several times — zero hangs.
   - reopen the playlist → the duplicate is **actually gone** (backend changed — SC-002).
3. Force a stall (console-stub `PlaylistAPI.remove` to `new Promise(() => {})`) → within ~30 s the
   UI exits `removing` into the visible **timed-out** message and never reports success (SC-003).
4. From that error, click **Remove** again (or dismiss) **without restarting** the client (SC-004).
5. Capture the transcript + a visual checklist into `reverify-evidence.md`.

## Definition of Done

- [ ] `RemovalOutcomeView` shows the timed-out copy for a stall and the generic copy otherwise;
      `RemovalOutcomeView.test.tsx` green at 100% for both branches; no raw stack in the message.
- [ ] `removal-termination.test.ts` (real store + real enricher) proves **both**: (a) a
      `uid`-carrying duplicate is actually removed on the happy path (executor `TrackRef` carries the
      `uid`; row → success; count drops) — the WP05 regression guard; (b) a never-settling executor
      terminates to `partial` with unchanged counts and no `none` — the WP03 guard.
- [ ] `npm run typecheck` clean; `npm run test:coverage` 100% line/branch.
- [ ] `reverify-evidence.md` committed with the live transcript covering SC-001..SC-004.

## Reviewer guidance

- The timed-out detection must be a pure derivation over `outcome.failed[].reason` (the `stalled:`
  prefix WP03 writes) — no store coupling, no new layer import.
- Confirm the integration test uses the **real** `createDetectionStore` (black-box), not a mocked
  `confirmRemoval`.
- Confirm live re-verify actually exercised SC-003's forced stall (not just the happy path) — this
  is the resilience claim the mission exists to prove.

## Risks

- **Live client unavailable** for T014 — T012/T013 can land first; T014 must not be marked done
  without a captured transcript (per the repo's live-verification-required protocol).
- **Reason-prefix coupling** — if WP03 changed the `stalled:` reason convention, update the view's
  `isStalled` derivation and its test in lock-step.

## Activity Log

- 2026-06-13T23:45:52Z – claude:opus:implementer:implementer – shell_pid=99364 – Started implementation via action command
- 2026-06-14T00:12:43Z – claude:opus:implementer:implementer – shell_pid=99364 – Ready for review — T012/T013 code (commit 3a45f74) + T014 live re-verify (SC-001..SC-004 all pass, evidence on main c0ba6a0)
- 2026-06-14T00:12:53Z – claude:opus:reviewer:reviewer – shell_pid=104928 – Started review via action command
