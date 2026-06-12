# Contract — removal UI (button + confirm dialog + outcome)

`src/ui/RemoveDuplicatesButton.tsx`, `RemovalConfirmDialog.tsx`, `RemovalOutcomeView.tsx`.
Hosted under `DetectionLoadedSummary`. Serves FR-001, FR-002, FR-005, FR-006, FR-007,
FR-010, FR-012, NFR-001, AS-1..AS-9. UI may import `src/domain/` + store context only
(no adapters/ports — `test/architecture.test.ts`).

## `RemoveDuplicatesButton`

- **Props:** `{ collectionKey, target: RemovalTarget, displayName }`.
- **Visibility (FR-001/FR-002, AS-1/AS-2):** renders **only** when the row state is
  `loaded`, `result.removableTrackCount > 0`, and `removal.phase ∈ {none, partial}`.
  Hidden when unscanned/scanning/failed, when `removableTrackCount === 0`, and while
  confirming/removing.
- **Disabled (FR-012):** disabled (or unmounted) while `removal.phase ∈
  {confirming, confirming2, removing}` — defense-in-depth atop the FSM ignore.
- **onClick:** `store.requestRemoval(collectionKey)` → FSM `none → confirming`. No host
  call here.
- **Label:** e.g. `Remove {removableTrackCount} duplicate(s)`.

## `RemovalConfirmDialog`

- **Props:** `{ collectionName, count, step: 1 | 2, onConfirm, onCancel }`.
- **Mount:** step 1 mounts when `removal.phase === 'confirming'`; step 2 mounts when
  `phase === 'confirming2'` (only reachable when `count > 25`, FR-006).
- **Copy (FR-005 / NFR-001):** step 1 states the target collection name and the **exact**
  count and that the earliest copy of each group is kept — e.g. *"Remove {count} tracks
  from '{collectionName}'? The earliest copy of each duplicate is kept."* Step 2 is an
  explicit bulk reconfirmation naming the count again.
- **Affordances (NFR-001):** distinct `Cancel` and `Remove` controls; the destructive
  action is not the default/auto-focused single-keypress target (no removal from one
  accidental activation).
- **onCancel (FR-007):** `store.cancelRemoval(collectionKey)` → `none`; nothing removed.
- **onConfirm:** `store.confirmRemoval(collectionKey)`; the store advances the FSM
  (`confirming → removing|confirming2`, `confirming2 → removing`) and runs the executor.
- **Boundary tests (NFR-003):** count = 24 → single confirm then removal; 25 → single
  confirm then removal; 26 → first confirm shows the second confirm before removal.

## `RemovalOutcomeView`

- **Props:** `{ outcome: RemovalOutcome }`, shown when `removal.phase === 'partial'`.
- **Behavior (FR-010 / AS-8):** states that the removal partially failed and how many
  did not complete; the still-present duplicates remain rendered by
  `DetectionLoadedSummary` over the updated `result` (failed copies were retained by
  `applyRemovalOutcome`). On full success there is no outcome view — the summary simply
  shows the reduced/zero removable count and the button hides (AS-7).

## `removing` feedback (NFR-002)

While `phase === 'removing'`, the row shows a non-blocking progress indicator driven by
`RemovalProgressEvent` (or an indeterminate state when no progress is emitted). The user
need not keep any dialog focused; the outcome lands in the row state.
