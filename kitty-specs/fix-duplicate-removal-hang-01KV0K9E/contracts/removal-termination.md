# Contract — Removal Flow Termination Guarantee

This mission adds no new external/port API. The relevant contract is a **behavioural invariant**
on the store's removal flow, expressed as the post-conditions WP review and tests assert. The
`RemovalExecutor` port contract is unchanged (see
`kitty-specs/remove-duplicate-tracks-button-01KTW64K/contracts/removal-executor-port.md`).

## Subject

`createDetectionStore(...).confirmRemoval(key)` — the orchestration that executes a removal.

## Invariant (the fix)

> **Every `confirmRemoval` invocation that reaches execution settles into a terminal removal
> phase — `none` (clean success) or `partial` (≥1 failure, copies retained) — within the stall
> ceiling. It MUST NOT remain in `removing` indefinitely.**

Formally, for a row that enters `removing`:

- **T1 (success):** executor resolves with `failed: []` before the ceiling ⇒ row → `loaded` with
  `removal: { phase: 'none' }`; `result` reflects removed tracks. (FR-002, FR-003)
- **T2 (partial):** executor resolves with `failed` non-empty before the ceiling ⇒ row →
  `loaded` with `removal: { phase: 'partial', outcome }`; failed copies stay visible. (FR-006)
- **T3 (reject):** executor rejects with a non-`AbortError` before the ceiling ⇒ wrapped into an
  all-failed `partial` (existing behaviour). (FR-006, FR-007)
- **T4 (stall):** executor neither resolves nor rejects before the ceiling ⇒ ceiling fires ⇒
  `controller.abort()` + `RemovalError('stalled')` ⇒ all-failed `partial`. Row leaves `removing`.
  (NFR-001, FR-004)
- **T5 (user cancel/reset):** `reset()` aborts the controller mid-removal ⇒ executor throws
  `AbortError` ⇒ **swallowed**; row is cleared by `reset` (NOT a `partial`). Distinct from T4.
  (FR-012 lineage)

## Post-conditions asserted by tests

1. **No-hang:** under a never-settling executor (`FakeRemovalExecutor` `hang` script), advancing
   the injected scheduler past `STALL_CEILING_MS` drives the row out of `removing` into `partial`.
2. **No false success (FR-007):** a stalled/failed removal never yields `phase: 'none'`.
3. **Truthful counts:** after T4, `result.removableTrackCount` is unchanged (nothing removed).
4. **Boundary (NFR-002):** under-ceiling settlement → T1/T2/T3 with the timer cleared (no leaked
   timer, no spurious abort); at-ceiling → T4 (deadline-wins tie-break); over-ceiling → T4.
5. **Stall ≠ cancel:** T4 produces `partial`; T5 produces a cleared row — the two abort sources
   are distinguishable and tested as a pair.
6. **No double-fire (FR-009):** a second `confirmRemoval` while one is in flight is rejected by
   the existing `removalControllers` lock (re-asserted, including across the stall path).
7. **Confirmations intact (FR-010):** the stall path is only reachable *after* the required
   confirmation(s); the ceiling does not bypass `confirming`/`confirming2`.

## Plain-language UI (NFR-004)

The `partial` view, when the outcome's failures carry the `stalled` reason, shows a timed-out
message (e.g. "Removal timed out — no tracks were removed. You can try again."). No raw stack or
exception text in the primary message; diagnostic detail (the `RemovalError.context`) may live in
a collapsed/secondary affordance.
