---
work_package_id: WP01
title: Live diagnosis & root-cause ADR-0017
dependencies: []
requirement_refs:
- C-004
- FR-001
- NFR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T18:51:29Z'
subtasks:
- T001
- T002
- T003
agent: "claude:opus:planner:implementer"
shell_pid: "65947"
history:
- timestamp: '2026-06-13T18:51:29Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: kitty-specs/fix-duplicate-removal-hang-01KV0K9E/diagnosis-evidence.md
execution_mode: planning_artifact
owned_files:
- kitty-specs/fix-duplicate-removal-hang-01KV0K9E/diagnosis-evidence.md
- .claude/adr/0017-removal-hang-root-cause-and-stall-ceiling.md
tags: []
---

# WP01 — Live diagnosis & root-cause ADR-0017

## Objective

Confirm, **with live evidence on the minimal 2-song duplicate playlist**, exactly which host
removal call hangs (or rejects), then document the root cause **and** the chosen stall-ceiling
guard in **ADR-0017** before any fix code is accepted (FR-001, NFR-003, C-004).

This WP produces **no source change** to `src/`. Its deliverables are:

1. `kitty-specs/fix-duplicate-removal-hang-01KV0K9E/diagnosis-evidence.md` (committed) — the raw
   console transcript + the R-1 classification.
2. `.claude/adr/0017-removal-hang-root-cause-and-stall-ceiling.md` (local; `.claude/` is
   gitignored in this repo, so it will **not** appear in the commit — that is expected).

> **Why this gates everything.** The hang is in-client behaviour no static read can reveal; the
> charter (C-004) requires live evidence to distinguish "never settles" from "rejects" before the
> fix lands. This mirrors how ADR-0011/0012 were corrected by live verification in this repo.

## Context — read first

- [`../research.md`](../research.md) §R-1 (root-cause hypothesis + the decision table) and §R-2
  (the capture recipe). **This WP executes R-2 and resolves R-1.**
- [`../plan.md`](../plan.md) "Summary" — the code-read hypothesis: `confirmRemoval`
  (`src/store/detection-store.ts:298`) `await`s `removalExecutor.remove(...)` (line 351) with **no
  stall ceiling**; if the host promise never settles, the row stays `removing` forever.
- `src/adapters/spicetify-removal-executor.ts` — the executor only checks `signal.aborted` at
  **batch boundaries**, not while awaiting the host call.
- Memory: the repo's **live-verification driver protocol** — the assistant runs the build/push/
  restart via CLI; the user clicks. Ask the user up-front what setup info you need, then hand a
  paste-ready console script + a visual checklist.

## Subtasks

### T001 — Live-capture the failing removal call (C-004)

**Purpose.** Observe, on the 2-song repro, whether `PlaylistAPI.remove(...)` is `CALLED` and then
never logs `RESOLVED`/`REJECTED` (hang) vs. logs an immediate `REJECTED`/`TypeError` (different
bug).

**Steps (driver protocol — you run the push/restart; the user clicks):**

1. Build and push to the client, then restart it:
   ```bash
   npm run build-local
   # copy dist/ into the Spicetify app folder + spicetify apply / restart client
   ```
2. Ask the user to create the minimal repro: a **2-song playlist where both songs are the same
   track** (so detection flags exactly one duplicate).
3. Hand the user this paste-ready devtools-console instrumentation (from research §R-2), to paste
   **before** clicking Remove:
   ```js
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
4. User clicks **Remove**, clears the confirmation, and reports the console output + the exact
   `items` payload shape (`{ uri, uid }`) and whether `uid` looks valid.
5. Check the Network panel for any `pathfinder`/GraphQL request the call issues and whether it
   completes.

**Capture into `diagnosis-evidence.md`:** the verbatim `[dedup] …` lines, the `items` payload, the
client/Spicetify versions, and a one-line verdict (hang vs reject vs wrong-shape vs bad-uid).

### T002 — Classify and decide the functional fix scope

**Purpose.** Map the captured behaviour onto the research §R-1 decision table and decide whether a
functional fix beyond the stall ceiling is needed.

| Captured | Root cause | Fix that lands in WP03 |
|---|---|---|
| `CALLED`, never `RESOLVED`/`REJECTED` | host promise **hangs** (primary hypothesis) | stall ceiling only (+ note *why* it hangs if discoverable) |
| `CALLED` then `REJECTED`, yet row stayed `removing` | the catch/await path is broken | a real catch-path bug — fix it in WP03; ceiling still required |
| immediate `TypeError` / bad arity / `"Given row id does not exist!"` | wrong call shape / stale `uid` | correct the call / `uid` derivation in WP03; ceiling still required |
| `RemovalError('malformed-result')` (no hang) | `uid` missing/malformed upstream | fix `uid` capture; note this does NOT by itself explain a hang |

**Output.** A short "Decision for WP03" section in `diagnosis-evidence.md` stating: (a) the
confirmed root cause, and (b) whether WP03 must include a functional fix in addition to the
ceiling. The ceiling is required by NFR-001 **regardless** of which row matched.

### T003 — Author ADR-0017

**Purpose.** Record the load-bearing design decision (DIRECTIVE_003 / NFR-003) as **one decision
thread**: the live-confirmed root cause *and* the stall-ceiling guard (store-level
`raceStallCeiling`, distinct `RemovalError('stalled')`, `STALL_CEILING_MS` default).

**Steps.**

1. Create `.claude/adr/0017-removal-hang-root-cause-and-stall-ceiling.md` following the existing
   ADR format (read `.claude/adr/0012-capture-playlist-uid-for-occurrence-removal.md` for the
   house style: Status / Context / Decision / Consequences).
2. Embed the T001 console transcript as the C-004 evidence.
3. Record the decisions from research §R-3/R-4/R-5: bound lives in the store (per ADR-0007), stall
   is a distinct `RemovalError('stalled')` (not a bare `AbortError`), `STALL_CEILING_MS = 30_000`
   as a hang guard (not an SLA), injected `Scheduler` for deterministic tests.
4. Cross-reference ADR-0007 (AbortSignal primitive) and ADR-0012 (`uid`).

## Definition of Done

- [ ] `diagnosis-evidence.md` committed, containing the verbatim console transcript, the `items`
      payload, and the R-1 classification with a "Decision for WP03" section.
- [ ] `.claude/adr/0017-…md` written with Status/Context/Decision/Consequences and the C-004
      transcript embedded (local file; not committed because `.claude/` is gitignored).
- [ ] The verdict explicitly answers FR-001: which call fails and how (hang vs reject vs shape).
- [ ] If a non-hang root cause was found, WP03's scope note records the additional functional fix.

## Reviewer guidance

- Verify the transcript genuinely distinguishes "never settles" from "rejects" — a pure reject
  would NOT hang (the existing catch handles it → `partial`), so a true indefinite hang must show
  `CALLED` with neither `RESOLVED` nor `REJECTED`.
- Confirm the ADR is one coherent decision thread (root cause + guard), not two stapled notes.
- Confirm no `src/` files were modified by this WP.

## Risks

- **Live client unavailable** — this WP cannot complete without it; do not fabricate a transcript.
- **Diagnosis surprises** (non-hang cause) — that is a *success* of the WP; record it and widen
  WP03's scope rather than forcing the hang hypothesis.

## Activity Log

- 2026-06-13T21:17:36Z – claude:opus:planner:implementer – shell_pid=65947 – Started implementation via action command
- 2026-06-13T21:46:57Z – claude:opus:planner:implementer – shell_pid=65947 – Live diagnosis complete: root cause is enricher uid-drop (Defect B, WP05) + confirmRemoval catch re-throw (Defect A, WP03), NOT a never-settling promise. Plan/tasks revised.
