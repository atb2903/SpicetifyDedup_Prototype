# Research — Fix Indefinite Hang on Duplicate Removal

Phase 0 output for `fix-duplicate-removal-hang-01KV0K9E`. Resolves the open questions before
design. Format per decision: **Decision · Rationale · Alternatives rejected**.

> ⚠️ **SUPERSEDED IN PART by live diagnosis (WP01, 2026-06-13).** The R-1 "never-settling host
> promise" hypothesis below was **falsified** on the live client: `PlaylistAPI.remove` is never
> called. The confirmed root cause is (B) the inline enricher dropping `uid` →
> `computeRemoveSet` throws, and (A) `confirmRemoval`'s catch re-computing `computeRemoveSet` and
> re-throwing uncaught → the row stays `removing`. See **[diagnosis-evidence.md](./diagnosis-evidence.md)**
> and **ADR-0017** for the authoritative root cause, and the revised [plan.md](./plan.md) /
> [tasks.md](./tasks.md) (WP05 added for the enricher fix; WP03 reframed to catch hardening). The
> R-3..R-7 stall-ceiling material below remains valid for the NFR-001 *defense-in-depth* guard.

---

## R-1 · Most likely root cause (to confirm with live evidence)

**Decision.** Treat *"the host removal promise never settles, and `confirmRemoval` has no stall
ceiling"* as the primary hypothesis, and confirm it (or refute it) with a live session before
the fix lands (FR-001, C-004).

**Evidence from the code read (not yet live-confirmed):**

- `confirmRemoval` (`src/store/detection-store.ts:298`) transitions the row to `removing`, then
  `await removalExecutor.remove(target, removeSet.tracks, controller.signal, onProgress)`
  (line 351). The row only leaves `removing` when `removeComplete` is dispatched (line 360) or
  the catch builds an all-failed `partial` (lines 378-395). **If the awaited promise never
  settles, neither happens — the row stays `removing` forever.** That is exactly the reported
  symptom.
- The executor (`src/adapters/spicetify-removal-executor.ts`) only checks `signal.aborted` at
  **batch boundaries** (line 163), *before* each `await this.dispatchBatch(...)`. While awaiting
  the host call it does not observe the signal. So a host call that hangs is not unstuck by
  aborting the controller — the abort is seen only when control returns to the batch loop, which
  never happens. **This is why a stall ceiling must live around the `await`, not rely on the
  existing batch-boundary abort.**
- On the 2-song repro there is a single batch (`BATCH_SIZE = 100`), so batching/pagination is
  not involved — consistent with the spec's "rules out volume/batching".

**Alternative causes the live session must positively exclude:**

| Hypothesis | What it would look like live | If true, the fix |
|---|---|---|
| Host promise **hangs** (primary) | `PlaylistAPI.remove(...)` logged as called; never resolves/rejects; no thrown error | Stall ceiling (this plan) + investigate *why* it hangs |
| Host call **rejects**, but the rejection path is broken | A rejection in console, yet row stays `removing` | A real bug in the catch path — fix that; ceiling still required by NFR-001 |
| **Wrong call shape** (signature drift) | `TypeError` / immediate reject, e.g. bad arg arity, or `uid` rejected (`"Given row id does not exist!"`) | Correct the call/`uid` derivation; per-track fallback already handles atomic-reject |
| `uid` **missing/malformed** on the playlist `TrackRef` | `RemovalError('malformed-result')` thrown in `prepareBatch` → all-failed `partial` (NOT a hang) | Fix `uid` capture upstream; would not by itself explain the hang |

> A pure reject/`TypeError` would *not* hang (the existing catch handles it → `partial`). So a
> genuine indefinite hang points hard at "never settles". The live session decides.

---

## R-2 · Diagnosis methodology (live evidence — C-004)

**Decision.** Capture the failing call with an instrumented console session on the minimal
2-song duplicate playlist, following the repo's established live-verification driver protocol
(push + restart the client via CLI, hand the user a paste-ready console script + visual
checklist).

**Capture recipe (to refine in quickstart):**

1. Wrap the two host removal entry points to log invocation, settlement, and timing:
   ```js
   // pasted into the Spotify devtools console before clicking Remove
   const P = Spicetify.Platform.PlaylistAPI;
   const orig = P.remove.bind(P);
   P.remove = async (uri, items) => {
     const t0 = performance.now();
     console.log('[dedup] PlaylistAPI.remove CALLED', uri, items);
     try {
       const r = await orig(uri, items);
       console.log('[dedup] RESOLVED in', (performance.now()-t0)|0, 'ms', r);
       return r;
     } catch (e) {
       console.log('[dedup] REJECTED in', (performance.now()-t0)|0, 'ms', e);
       throw e;
     }
   };
   ```
2. Click **Remove** on the 2-song playlist; watch for `CALLED` followed by neither
   `RESOLVED` nor `REJECTED` (→ hang confirmed), vs. an immediate `REJECTED` (→ different bug).
3. Note the exact `items` payload shape (`{ uri, uid }`) and whether `uid` looks valid — cross
   against ADR-0012 (`uid` is required for playlist occurrence removal).
4. Check the Network panel for any `pathfinder`/GraphQL request the call may issue and whether it
   completes.

**Output of diagnosis:** the confirmed failing call + payload, recorded in **ADR-0017** (NFR-003)
with the console transcript as evidence (C-004). Only then does the fix land.

**Rationale.** The hang is in-client behaviour no static read or web doc can reveal; only a live
trace distinguishes "never settles" from "rejects". This mirrors how ADR-0011/0012 were
corrected by live verification in this repo.

---

## R-3 · Stall-ceiling mechanism

**Decision.** In `confirmRemoval`, race the executor promise against an injected scheduler's
deadline. On elapse: `controller.abort()` (stop further batches) **and** raise
`new RemovalError('stalled', …)`. The existing catch then builds the all-failed `partial`.

```ts
// shape (final form pinned in data-model.md / implementation):
const outcome = await raceStallCeiling(
  removalExecutor.remove(target, removeSet.tracks, controller.signal, onProgress),
  STALL_CEILING_MS,
  schedule,            // injected; default real setTimeout/clearTimeout
  () => controller.abort(),
);
// raceStallCeiling rejects with RemovalError('stalled', …) on deadline,
// after invoking the abort callback. A late executor settlement loses the race
// and is harmless (its result/throw is ignored; the abort already fired).
```

**Why the store, not the executor.** ADR-0007 makes AbortSignal the single cancellation
primitive and the **store owns every `AbortController`**; the established convention is "adapters
propagate, store decides terminal state" (the scanner's own JSDoc: *"never catches errors"*).
Putting a timer in the adapter would split timing policy across layers and contradict both. The
user explicitly prioritised consistency with existing patterns.

**Alternatives rejected.**
- *Executor-level per-call timeout* — pushes timing policy into a pure mutation seam; tangles
  with the per-track fallback; against ADR-0007 placement.
- *Both layers (defense in depth)* — largest surface, two constants, two boundary suites; not
  warranted for a single-seam bug.
- *`AbortSignal.timeout(ms)` + signal combination* — clean and AbortSignal-native, but it fires
  a `DOMException('TimeoutError')` that would have to be carefully distinguished from the
  user-cancel `AbortError`, and happy-dom timer/`AbortSignal.timeout` support is less certain
  than an injected scheduler. Kept as a fallback if the injected-scheduler race proves awkward,
  but the injected scheduler is the recommendation for test determinism (R-6).

---

## R-4 · Stall must be a failure, distinct from user-cancel

**Decision.** The stall path raises `RemovalError('stalled')` — **not** a bare `AbortError`.

**Rationale.** `confirmRemoval`'s catch swallows `AbortError` and `return`s **without dispatching
a terminal state** (`detection-store.ts:363`) — correct for a user cancel/reset (the FSM already
moved the row via `reset()`), but if a *stall* took that branch the row would stay `removing` —
i.e. it would re-create the very bug. A `RemovalError('stalled')` satisfies `isRemovalError(e)`,
so it flows through the existing non-Abort branch (lines 371-395) → all-failed `partial`. The
controller is still aborted so the executor stops batching; the **subsequent** `AbortError` the
executor may throw loses the race and is ignored.

This is the crux of the fix and gets dedicated tests: (a) stall → `partial` (terminal), and
(b) user reset mid-removal → swallowed (no `partial`, row cleared) — proving the two abort
sources stay distinguishable.

---

## R-5 · Ceiling value

**Decision.** A single named constant — propose `STALL_CEILING_MS = 30_000` (30 s) — defined in
the store module, documented as a **hang guard, not a backend SLA**. Tunable in one place.

**Rationale.** 30 s is comfortably longer than any plausible healthy `PlaylistAPI.remove`
round-trip on a small playlist (sub-second observed in prior live-verify on bulk batches), so it
never trips a slow-but-live call, while still bounding a dead one to a human-tolerable wait. The
"avoid hard time cutoffs in NFRs" principle is respected because we are bounding a *non-settling*
call, exactly as NFR-001 frames it — not setting a performance budget on Spotify's backend.

**Alternatives rejected.** Shorter (5–10 s) risks tripping a genuinely slow live call on a large
batch (false failure). Longer (60 s+) makes the hang feel like the original bug to the user. The
value lives behind one constant precisely so it can be revisited without code surgery.

---

## R-6 · Test strategy for the time bound (NFR-002 boundary)

**Decision.** Inject a **scheduler seam** into `createDetectionStore` (a small interface over
`setTimeout`/`clearTimeout`), defaulting to the real platform timers — mirroring the existing
injected-`clock` default in `createDetectionScanner`. Tests pass a controllable fake scheduler.

**Boundary coverage (charter mandate):** with a deterministic scheduler, assert the three points
around the ceiling:
- **under** — executor settles *before* the deadline → normal `none`/`partial`; timer cancelled.
- **at** — settlement and deadline coincide → defined winner (document the tie-break: deadline
  fires → `stalled` is the safe choice, or settle-wins; pin in implementation + test).
- **over** — executor never settles → deadline fires → all-failed `partial` (the hang guard).

Plus the stall-vs-cancel pair from R-4.

**Fake-executor support.** Add a `{ kind: 'hang' }` script to `FakeRemovalExecutor` returning a
never-settling promise (`new Promise(() => {})`), so the integration test can exercise a true
non-settling call through the real store (DIRECTIVE_036). Consistent with the existing scripting
model (`ok` / `partial` / `partial-uids` / `throw`).

**Rationale.** Injection keeps the store deterministic and pure-ish (same pattern as `clock`),
avoids brittle global `vi.useFakeTimers()` coupling, and makes the boundary assertions exact.

**Alternative rejected.** `vi.useFakeTimers()` with real `setTimeout` in the store — works, but
introduces global timer mocking and is less consistent with the repo's existing dependency
injection convention.

---

## R-7 · Platform / API notes (authoritative in-repo references)

The load-bearing host facts are already live-verified and recorded in this repo; re-fetching
community docs risks staleness. Authoritative references:

- **`PlaylistAPI.remove(playlistUri, [{ uri, uid }])`** — playlist occurrence removal addresses
  each item by `uid`; **atomic reject-whole** (a single stale `uid` rejects the entire call and
  removes nothing) — live-verified 2026-06-12, recorded in `spicetify-removal-executor.ts` JSDoc
  and ADR-0012. The per-track fallback already exploits this (a rejected bulk batch retries each
  track singly).
- **`LibraryAPI.remove({ uris })`** — Liked Songs removal by `uri`; tolerant (removing an absent
  URI is a no-op that resolves). Out of primary scope unless diagnosis proves a shared cause.
- **Public Web API is unreachable from the client** (429 cold) — never route removal through
  `api.spotify.com` (C-001, ADR-0011).
- **`AbortController` / `AbortSignal`** — standard platform primitive; `signal.aborted` and
  `controller.abort()` already used throughout the store and adapters (ADR-0007).
- **`Promise.race`** — settles with the first arm to settle; losing arms' later settlements are
  ignored (no unhandled rejection as long as each arm has a `.catch` or is awaited). The race
  helper must attach a no-op rejection handler to the executor arm so a late abort-rejection
  after the deadline does not surface as unhandled.

---

## Open items carried into design

- Pin the exact `raceStallCeiling` signature + the **at-boundary tie-break** (R-6) in
  `data-model.md` / implementation.
- ADR-0017 records the confirmed root cause (R-1/R-2) **and** the stall-ceiling guard (R-3/R-4).
- If diagnosis (R-2) reveals a *non-hang* root cause (reject / wrong shape / bad `uid`), the
  functional fix is added alongside the ceiling — the ceiling is still required by NFR-001
  regardless.
