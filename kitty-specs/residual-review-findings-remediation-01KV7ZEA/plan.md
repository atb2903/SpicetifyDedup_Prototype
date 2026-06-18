# Implementation Plan: Residual Review Findings Remediation

**Mission**: `residual-review-findings-remediation-01KV7ZEA`
**Created**: 2026-06-18
**Spec**: [spec.md](./spec.md)
**Branch contract**: start `main` · planning base `main` · merge target `main`

---

## 1. Architectural framing

This mission introduces **no new architectural pattern**. The repo is Ports &
Adapters (hexagonal), enforced by `test/architecture.test.ts` / ADR-0001:

```
domain (pure types + transforms)
  ↑ ports (interfaces, import domain only)
      ↑ adapters (host-bound; import domain + ports)
          ↑ store (Zustand FSM; imports domain + ports + adapters)
              ↑ ui (React; imports store + domain)
```

Every change below stays inside an existing layer and preserves the existing
import direction. The single **contract-surface** change is the
`TracksEnumerator` port return type (WP01); it keeps the same import direction
and is covered by the architecture test re-run (NFR-003).

Per *prefer-consistency-over-novelty*, each fix mirrors prior art already in the
file it touches; deviations are called out explicitly per WP.

## 2. Reference docs

**No external library or host-API surface changes.** This mission corrects
internal correctness, documentation, and dead code on seams that already wrap
the Spicetify host APIs (`LibraryAPI`/`PlaylistAPI`); no new Spicetify call,
no Web API call, no new dependency. Therefore **no online-doc pull is required**
for planning. The load-bearing host facts (atomic reject-whole `PlaylistAPI.remove`,
inline `duration.milliseconds`, `/v1/me/tracks` 502, public API unreachable) are
already captured in ADR-0011/0017/0019 and `CLAUDE.md`; they are unchanged by
this work.

## 3. Decisions locked before planning

| # | Decision | Source |
|---|---|---|
| D-1 | **NEW-1 tally flows on the return value, not the progress event.** `TracksEnumerator.enumerate` returns `{ tracks, skippedLocalCount }` (an `EnumerationResult`); the scanner reads `.skippedLocalCount` directly. The `ProgressEvent` union is unchanged. This deliberately breaks from the `hostTotalLength`-via-progress derivation that *caused* NEW-1. | User interview (2026-06-18) |
| D-2 | **NEW-4 is fixed at the view layer.** `RemovalOutcomeView` already branches on `outcome.provenance`; the `compute-failed` case renders a terminal explanation and suppresses the retry affordance. The FSM mapping (`compute-failed → partial`) is left intact so the truthful count still renders; the *retry control* (not the phase) is what's withheld. Alternative considered: a distinct terminal FSM phase — rejected as a larger blast radius that would fork `partial` handling used by `stalled`/`executor-failed`. | Plan (consistency: view already owns provenance branching) |
| D-3 | **NEW-3 vs NEW-5 `'stalled'` are different symbols.** NEW-5 removes only `RemovalErrorCode.'stalled'` (`removal-errors.ts:44`), which has **zero producers** (verified). The live `RemovalOutcomeProvenance.'stalled'` (`removal-types.ts:91`) and the FSM `case 'stalled'` (`detection-state.ts:326`) are correct and **must not** be touched. | Plan (verified by grep) |
| D-4 | **NEW-2 reuses the existing progress event shape.** `RemovalProgressEvent` is already `{ removedSoFar, total }`; per-track fallback progress emits that same shape. No new event variant. | Plan (grounded in `removal-types.ts:134-139`) |

## 4. Work packages

Each WP is TDD-first (failing test observed to fail, then implement — C-003 /
DIRECTIVE_034) and must leave all charter gates green (NFR-001 100% coverage,
NFR-002 strict typecheck, NFR-003 architecture test, NFR-004 full suite). WPs
are ordered for a sequential, recoverable cadence (one subagent at a time).

### WP01 — NEW-1: true local-only skip tally (FR-001, FR-002, FR-003)

**Behavioural.** Change the enumerator contract so the genuine local-file count
is reported on the return value, and stop the scanner from inferring it.

| File | Change |
|---|---|
| `src/domain/detection-types.ts` | Add `EnumerationResult = { tracks: ReadonlyArray<RawTrack>; skippedLocalCount: number }`; JSDoc that `skippedLocalCount` is the genuine `spotify:local:` tally only (never non-track items). |
| `src/ports/tracks-enumerator.ts` | `enumerate(...)` returns `Promise<EnumerationResult>`; update JSDoc (no longer "resolves with the full ordered list"). |
| `src/adapters/spicetify-tracks-enumerator.ts` | Count `isLocalFile(item)` skips separately from `!isTrackKind(item)` skips (the loop at `:337-344` already distinguishes them); return `{ tracks, skippedLocalCount }`. Non-track items stay uncounted/invisible (FR-002). |
| `src/adapters/fake-tracks-enumerator.ts` | Mirror the new return shape; let fixtures express a local-skip count for tests. |
| `src/adapters/detection-scanner.ts` | Destructure `{ tracks, skippedLocalCount }` from `enumerate` (`:82`); **delete** the `hostTotalLength − scannedTrackCount` derivation (`:73-80, :136-138`); use the reported `skippedLocalCount` in the result. `hostTotalLength` tracking for `enumerating` progress is no longer needed for the tally. |
| `src/ui/DetectionLoadedSummary.tsx` | Confirm the "skipped N local files" annotation reads the (now-truthful) `skippedLocalCount`; no episode/non-track label is introduced (FR-002). |

**Test strategy (TDD):**
- Enumerator: a page mixing genuine tracks + `spotify:local:` items + `type:'episode'` items → `skippedLocalCount` counts **only** the local files; episodes are excluded from `tracks` and uncounted.
- Boundary (NFR-005): zero local + zero episodes; exactly one local; exactly one episode; a page that is all-local; all-episode.
- Scanner: given a fake returning `{ tracks, skippedLocalCount: k }`, the `DetectionResult.skippedLocalCount === k` regardless of `hostTotalLength`/episode counts.
- AS-1/AS-2 scenarios: episodes-but-no-locals → annotation absent/zero; genuine locals present → annotation reflects only locals.

### WP02 — DRIFT-1: Liked-Songs count fetch auth-expiry classification (FR-004)

**Behavioural.** Apply the shared `looksLikeHostAuthExpired` predicate to the
Liked-Songs count sub-fetch in the playlists loader so an expired token yields
the same auth-expired guidance as a rootlist auth-expiry (fully realises FR-007
of the prior mission).

| File | Change |
|---|---|
| `src/adapters/spicetify-playlists-loader.ts` | Wrap the Liked-Songs count fetch's rejection through `looksLikeHostAuthExpired` (`src/domain/host-auth.ts`) and surface the auth-expired error code, mirroring the rootlist fetch and the enumerator's `fetchPage` (`spicetify-tracks-enumerator.ts:403-416`). |

**Test strategy (TDD):** loader stub where the rootlist resolves but the
Liked-Songs count fetch rejects with an auth-expired signal → auth-expired error
(not generic). Symmetry test: auth-expiry on the rootlist call still classified.

### WP03 — NEW-2: per-track fallback abort + progress (FR-005, FR-006)

**Behavioural.** Harden the per-track fallback loop in the removal executor.

| File | Change |
|---|---|
| `src/adapters/spicetify-removal-executor.ts` | In the fallback loop (`:191-200`): (a) check `signal.aborted` between per-track retries and stop issuing further single-track host calls once aborted, returning the accumulated partial; (b) emit `onProgress({ removedSoFar, total })` after each per-track retry (not only per-batch at `:206`). Update the class/`remove` JSDoc (`:18-19`, `:134-136`, `:203-206`) so it no longer claims the fallback always runs to the batch end. |

**Test strategy (TDD):**
- Abort mid-fallback: a rejected batch of N, signal aborts after the k-th retry → at most k+1 single-track host calls issued, accumulated partial returned (RISK-1 limit: the one in-flight host await still completes — asserted, not engineered around).
- Per-track progress: a rejected batch of N making progress → `onProgress` fires per track with monotonically non-decreasing `removedSoFar` (re-arms the store watchdog — verified end-to-end against the store in an integration test).
- Boundary (NFR-005): `BATCH_SIZE` (100) bound retained — batch of 99 / 100 / 101 tracks; abort at retry 0, mid, and last.

### WP04 — NEW-4: compute-failed is terminal, non-retryable (FR-007)

**Behavioural (UI).** Per D-2.

| File | Change |
|---|---|
| `src/ui/RemovalOutcomeView.tsx` | In the `compute-failed` case (`:62`): render a terminal explanation and **suppress** the retry affordance. Other provenances (`stalled`, `executor-failed`, `host` partial) keep their retry path. |

**Test strategy (TDD):**
- A `compute-failed` outcome renders the terminal message and renders **no**
  retry control; dispatching is impossible from this view.
- Regression: `stalled` / `executor-failed` / `host`-partial outcomes still
  offer retry.

### WP05 — sibling/FR-008: AbortError-while-stalled still terminates

**Behavioural (store).** Defensive guard so a `stalled` operation whose executor
*rejects* (rather than resolves) with `AbortError` still reaches a terminal
outcome.

| File | Change |
|---|---|
| `src/store/detection-store.ts` | In `executeRemoveSet`'s catch (`:618-625`): when `e` is an `AbortError` **and** `stalled === true`, dispatch a terminal `'stalled'` outcome (e.g. `removed: []`, `failed: removeSet.tracks`, `provenance: 'stalled'`) via `applyTerminalOutcome` instead of swallowing; a non-stalled `AbortError` (genuine user cancel/reset) is still swallowed. Correct the `:620` comment that asserts "a stall never lands here". |

**Test strategy (TDD):**
- Executor configured to reject with `AbortError` *after* the watchdog trips →
  store dispatches `removeComplete` (row leaves `removing`, lands `partial`).
- Regression: a plain user-cancel `AbortError` (watchdog not tripped) is still
  swallowed (row already moved to `idle`).

> Sequencing note: WP04 and WP05 both touch the removal terminal path
> (`detection-state.ts` / `detection-store.ts`); run them sequentially.

### WP06 — NEW-3 + NEW-5: doc accuracy + dead-code removal (FR-011, FR-012)

**Non-behavioural** (doc + dead type). No production behaviour changes.

| File | Change |
|---|---|
| `src/store/detection-store.ts` | Rewrite `applyTerminalOutcome` JSDoc (`:535-539`): it is the apply path for **host-success** and **stalled-partial** outcomes too (possibly non-empty `removed`, see callers `:612`, `:617`), not only synthesised empty-`removed` cases. State the true no-throw rationale: every `removed` key is a real member of `result` by construction, so `applyRemovalOutcome` cannot throw `outcome-mismatch`. (FR-011) |
| `src/domain/removal-errors.ts` | Remove `'stalled'` from `RemovalErrorCode` (`:44`) and delete its JSDoc bullet (`:34-37`). Verified no producer of `RemovalError('stalled')` exists. Do **not** touch `RemovalOutcomeProvenance.'stalled'` (D-3). (FR-012) |

**Test strategy:** NEW-3 is doc-only (no test). NEW-5: a type-level/exhaustiveness
assertion that the union has exactly the four remaining codes and the full suite
+ strict typecheck still pass (proving no reference to the removed member). The
existing `isRemovalError` / code-handling tests must remain green.

### WP07 — RISK-1 + NEW-3-ADR: honest termination docs + faithful stall test (FR-009, FR-010)

**Docs + test-double + test rewrite.** Per C-001 no termination mechanism is
reintroduced.

| File | Change |
|---|---|
| `.claude/adr/0019-per-batch-stall-watchdog-and-faithful-partial.md` | Correct any claim that a never-settling host call is guaranteed to terminate; state the watchdog's abort takes effect only at **batch boundaries** and cannot interrupt an in-flight host await. (FR-009) |
| watchdog + removal JSDoc | Align JSDoc (e.g. `createStallWatchdog`, `executeRemoveSet` `:558-573`) with the batch-boundary limitation. (FR-009) |
| `src/adapters/fake-removal-executor.ts` | Make the `hang` test double **non**-abort-aware (`:225` and the hang path) so it models a genuinely never-settling host call. (FR-010) |
| `test/integration/removal-termination.test.ts` | Assert real production behaviour: a never-settling host call leaves the row in `removing`; route-reset is the documented escape. No assertion that the watchdog *terminates* the in-flight call. (FR-010) |

**Test strategy:** the rewritten termination test is itself the deliverable; it
must fail against the old abort-aware fake (proving it now reflects production)
and pass once the fake is non-abort-aware. Coverage of the watchdog/abort paths
must stay at 100% (NFR-001).

## 5. Sequencing & dependencies

| Order | WP | Touches | Independent of |
|---|---|---|---|
| 1 | WP01 (NEW-1) | enumerator/scanner/summary | all removal WPs |
| 2 | WP02 (DRIFT-1) | playlists loader | all others |
| 3 | WP03 (NEW-2) | removal executor | store/UI |
| 4 | WP04 (NEW-4) | RemovalOutcomeView | — |
| 5 | WP05 (FR-008) | detection-store | (after WP04: shared removal path) |
| 6 | WP06 (NEW-3/NEW-5) | detection-store JSDoc, removal-errors | (after WP05: shared file) |
| 7 | WP07 (RISK-1) | ADR, watchdog JSDoc, fake, termination test | — |

WP01–WP03 are mutually independent and could be parallelised, but per the
sequential-subagent preference they run one at a time. WP04→WP05→WP06 share
removal store/state/error files and **must** be sequential.

## 6. Gates & risk boundaries

- **Charter gates** (every WP): `npx tsc --noEmit` clean; `npm run test:coverage`
  = 100% statements/branches/functions/lines; `test/architecture.test.ts` green;
  full `npx vitest run` green (≥ current count + net-new tests).
- **Risk boundaries (C-002)** unchanged and re-verified by the existing suite:
  no silent mutation, per-action confirmation, second confirmation > 25,
  single-collection scope, no auto-run on launch.
- **C-001**: WP07 reviewers confirm no promise-race/timer-wins termination was
  reintroduced.
- **C-004**: no opportunistic refactors outside the eight findings.

## 7. ADR obligations (DIRECTIVE_003)

- **WP01** is a load-bearing port-contract change → author a new ADR recording
  the `EnumerationResult` return-type decision and why the tally moved off the
  progress event (the NEW-1 root cause). New ADR under `.claude/adr/`.
- **WP07** edits ADR-0019 (honesty correction) — not a new ADR.
