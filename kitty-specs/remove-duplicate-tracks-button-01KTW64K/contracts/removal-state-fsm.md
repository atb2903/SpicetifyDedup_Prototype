# Contract — removal sub-state FSM (ADR-0013)

`src/domain/detection-state.ts` (extended). Pure `transition`. Serves FR-005, FR-006,
FR-007, FR-011, FR-012.

## States (`loaded.removal`)

`none` → `confirming` → (`confirming2`) → `removing` → (`none` | `partial`)

```ts
type RemovalState =
  | { phase: 'none' }
  | { phase: 'confirming' }
  | { phase: 'confirming2' }
  | { phase: 'removing'; progress?: RemovalProgressEvent }
  | { phase: 'partial'; outcome: RemovalOutcome };
```

## Actions and transitions

See data-model §5.1 for the full table. Contractual rules:

1. **All removal actions are valid only from `kind: 'loaded'`.** From `idle` / `scanning`
   / `failed` they are ignored (return input state by reference). Protects against late
   dispatches.
2. **`removeRequest`:** `none → confirming`; ignored from `confirming` / `confirming2` /
   `removing` (FR-012 concurrency); `partial → confirming` (retry the still-present
   copies).
3. **`confirmFirst`:** from `confirming`, goes to `removing` when
   `result.removableTrackCount <= 25`, else to `confirming2` (FR-006). The threshold
   discriminator is supplied by the store (which holds the count); the FSM applies it.
   **Boundary:** 24 → `removing`; 25 → `removing`; 26 → `confirming2`.
4. **`confirmSecond`:** `confirming2 → removing`. Ignored elsewhere.
5. **`removeCancel`:** `confirming | confirming2 → none` (FR-007 — nothing removed).
   Ignored from `removing` (a started removal is not cancellable via the dialog; the
   row-level `cancel`/`start` still apply).
6. **`removeProgress`:** `removing → removing` with the new progress; ignored elsewhere.
7. **`removeComplete { result, outcome }`:** from `removing`, transition to
   `{ kind:'loaded', result, removal: outcome.failed.length === 0 ? {phase:'none'} :
   {phase:'partial', outcome} }`. The `result` is the already-applied
   `applyRemovalOutcome` output (the store computes it before dispatch). Ignored from any
   non-`removing` phase.
8. **Existing scan actions still apply to `loaded`:** `cancel` → `idle` (whole row);
   `start` → `scanning` (explicit re-scan, discards removal state). `progress` /
   `complete` / `fail` remain ignored from `loaded`.
9. **Immutability:** active cells allocate a new state; ignored cells return the input by
   reference (no spurious subscriber re-render).

## No-auto-run guarantee (FR-011)

No transition into `removing` exists except via `confirmFirst` (≤25) or `confirmSecond`
(>25). There is no time-, mount-, or completion-triggered edge. Combined with the store
having no listener that dispatches these, removal cannot start without a user click.

## Test matrix (every cell)

A 5-state × 6-removal-action grid plus the 5 inherited scan actions from `loaded`, with
explicit reference-equality assertions on every ignored cell, and the 24/25/26 branch on
`confirmFirst`. Full 100% line/branch (NFR-003).
