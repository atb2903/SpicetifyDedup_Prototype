# Mission Review Report: duplicate-track-detection-01KTFH5H

**Reviewer**: Claude (spec-kitty-mission-review, pre-merge variant)
**Date**: 2026-06-11
**Mission**: `duplicate-track-detection-01KTFH5H` — Duplicate Track Detection
**Mission type**: software-dev
**Baseline**: `main` @ `34c9d88` (no `baseline_merge_commit` recorded in `meta.json`)
**Review scope**: Pre-merge fidelity review (mission NOT merged; WP09 unstarted). Requested by user.
**WPs nominally approved**: WP01–WP08 (`approved` lane). WP09 in `planned`.

> ⚠️ **Precondition note.** This is *not* a post-merge review. The standard `spec-kitty-mission-review`
> precondition (all WPs `done`, mission merged) is **not** met. No `spec-kitty merge` ran; the mission
> integration branch is empty of code; WP09 was never completed. This report is a pre-merge acceptance
> gate. The headline finding is structural, not per-FR.

---

## Executive Summary

The **per-WP work is high quality in isolation** — each lane is green, heavily tested, and faithful to its
slice of the spec (e.g. WP02's detector has the mandated 1999/2000/2001 ms boundary tests; WP05's adapters
have 700–900-line test files). **But the mission as a whole has never been assembled, and as it stands it is
not mergeable.** Three independent blockers:

1. **No integration exists.** The 8 implementation lanes each branched from `main` in parallel. Because no
   upstream WP's code was ever on `main`, **every lane privately re-stubbed the shared files it depended on**,
   producing 4–7 divergent copies of the domain layer. There is no branch — not `main`, not the mission
   branch — that contains the whole reviewed mission. The "approved" status on 8 WPs was awarded in 8 silos,
   each reviewing a *different* copy of the shared code.
2. **The wired application does not run WP02's algorithm.** lane-h (WP08, the integration WP) is **missing the
   entire core algorithm** (`duplicate-detector.ts`, `duplicate-key.ts`, `enriched-track-parser.ts`) and
   instead **inlines a second copy** of the detection logic in `adapters/detection-scanner.ts`. The
   exhaustively-tested WP02 detector is not what ships.
3. **WP09 is incomplete and unverified.** ADRs 0006–0009 exist, but live-verification was never signed off
   (`notes.md` missing, WP09 still `planned`, never re-reviewed after the screenshot was added).

**Verdict: FAIL** (pre-merge). Blocking findings below. None of these are "the code is wrong" — the code is
mostly right *per lane*. The failure is that the lanes were never reconciled into one coherent, reviewed,
buildable whole, which is precisely the gap a parallel-lane strategy must close before merge.

---

## How the code is actually laid out (orientation)

| Branch | Ahead of main | Contains |
|---|---|---|
| `main` @ 34c9d88 | — | Pre-mission scaffolding only. **Zero** detection source files. |
| `kitty/mission-…` (integration) | 0 commits | No source. Only spec-file edits/deletions. Stale. |
| `…-lane-a` (WP01) | 1 | `detection-{errors,state,types}.ts` (+tests) |
| `…-lane-b` (WP02) | 2 | `duplicate-{detector,key}.ts`, `enriched-track-parser.ts` (+ its own copies of errors/types) |
| `…-lane-c` (WP03) | 1 | ports + `retry-after.ts` (+ own copies of errors/types) |
| `…-lane-d` (WP04) | 6 | fakes + composition adapter (+ own copies of **everything** upstream) |
| `…-lane-e` (WP05) | 2 | Spicetify adapters (+ own copies of errors/types/parser/ports) |
| `…-lane-f` (WP06) | 1 | store + context + integration test (+ own copies) |
| `…-lane-g` (WP07) | 1 | 3 UI views (clean — only WP01 types as dep) |
| `…-lane-h` (WP08) | 1 | UI wiring + app.tsx + **own copies of almost the entire stack** |

`lanes.json` computed **all 9 lanes as `parallel_group: 0` with `depends_on_lanes: []`** — i.e. the
dependency chain the spec/tasks explicitly declare (WP01→WP02→WP03→WP04→…) was **flattened to "all
parallel, no dependencies."** That is the root cause of the re-stubbing: each lane had to fabricate its
upstream dependencies because the integration order that would have supplied them was never modeled.

---

## FR Coverage Matrix (lane-level)

Coverage is assessed against the **owning lane**, where each FR is genuinely tested. The caveat for every
row: this coverage only holds *within that lane's private copy of the code*; it does **not** demonstrate the
FR holds in any integrated artifact, because no integrated artifact exists.

| FR | Requirement (brief) | Owner WP / lane | Test evidence | Adequacy (in-lane) | Integration finding |
|----|---------------------|-----------------|---------------|--------------------|---------------------|
| FR-001 | Enumerate non-local tracks | WP05/lane-e | `spicetify-tracks-enumerator.test.ts` (888 ln) | ADEQUATE | [DRIFT-1] |
| FR-002 | Enrich (name, artist, durationMs, canonicalUri) | WP02+WP05 | parser + enricher tests | ADEQUATE | [DRIFT-1] |
| FR-003 | Skip `spotify:local:`, report `skippedLocalCount` | WP05/lane-e | enumerator tests (local/non-local fixture) | ADEQUATE | [DRIFT-1] |
| FR-004 | Canonical-URI duplicate match (`linked_from`) | WP02/lane-b | `duplicate-detector.test.ts` (AS-4 case) | ADEQUATE | [RISK-1] inlined copy in lane-h |
| FR-005 | name+artist + ≤2000 ms (inclusive) | WP02/lane-b | 27 boundary refs; `Math.abs() <= 2000` | ADEQUATE | [RISK-1] |
| FR-006 | One group per underlying track | WP02/lane-b | detector grouping tests | ADEQUATE | [RISK-1] |
| FR-007 | `defaultKeep` = earliest member | WP02/lane-b | detector tests | ADEQUATE | [RISK-1] |
| FR-008 | Per-collection observable state, no cross-talk | WP06/lane-f | `detection-store.test.ts` (524 ln, parallel-rows) | ADEQUATE | [DRIFT-1] |
| FR-009 | Row shows summary or "No duplicates found" | WP07/lane-g + WP08/lane-h | view + row tests | ADEQUATE | [DRIFT-1] |
| FR-010 | Explicit-trigger only, no auto-run | WP08/lane-h | `app.test.tsx` (no Spicetify call pre-interaction) | ADEQUATE | — |
| FR-011 | Atomic replace on re-trigger | WP01+WP06 | store re-trigger test | ADEQUATE | [DRIFT-1] |
| FR-012 | Route-away resets in-flight scans | WP06/lane-f | `RouteResetContext.test.tsx` | ADEQUATE | [DRIFT-1] |
| FR-013 | Button disabled while scanning | WP08/lane-h | `DedupButton.test.tsx` | ADEQUATE | — |

**No FR is untested.** The problem is the opposite of a punted FR: each FR is well-tested *somewhere*, but
the somewheres are mutually unintegrated branches.

---

## Drift Findings

### DRIFT-1: Mission never integrated — N divergent copies of the shared modules
**Type**: ARCHITECTURAL-INTEGRITY / CROSS-WP (DIRECTIVE_001, C-006 SRP)
**Severity**: CRITICAL (blocking)
**Evidence**:
- `git log main..kitty/mission-duplicate-track-detection-01KTFH5H` → **empty** (integration branch has no
  mission code).
- Per-lane `git diff main..<lane> --stat` shows the same filenames implemented independently with divergent
  line counts:
  - `src/domain/detection-errors.ts`: 126 / 103 / 97 / 66 / 80 / 101 / 74 lines (lanes a/b/c/d/e/f/h).
  - `src/domain/detection-types.ts`: 227 / 182 / 145 / 134 / 209 / 155 / 135 lines.
  - `src/domain/detection-state.ts`: 136 / 136 / 115 / 98 (lanes a/d/f/h).
  - `src/adapters/retry-after.ts`: 166 / 166 / 104 (lanes c/d/e).
- `lanes.json`: all lanes `parallel_group: 0`, `depends_on_lanes: []`, despite tasks.md declaring an explicit
  WP01→WP02→WP03→WP04→WP05/06→WP07→WP08→WP09 chain.

**Analysis**: A ports-and-adapters mission with a real dependency DAG was scheduled as fully-parallel
independent lanes. Each lane therefore re-created its upstream dependencies to compile and test in isolation.
The contract-level surface stayed consistent (type names and the 7-member `DetectionErrorReason` union match
across lanes, because all derive from `data-model.md`), so the divergence is mostly JSDoc and internal
structure rather than incompatible signatures — but it still means: (a) every "approved" review validated a
*copy* that will not be the merged artifact; (b) a real merge will collide on every shared file with no
defined resolution order; (c) the charter's strict file-level SRP (C-006) is violated by construction —
e.g. `detection-errors.ts` has 7 authors-of-record. This is the load-bearing blocker: **there is nothing
coherent to merge, and nothing that was reviewed equals what would merge.**

### DRIFT-2: WP09 governance/DoD incomplete
**Type**: PUNTED-WP / DECISION-DOC + LIVE-VERIFICATION (C-007, DIRECTIVE_003, DoD)
**Severity**: HIGH (blocking for merge; partially remediated)
**Evidence**:
- WP09 lane = `planned` in `status.json` (never reached `approved`); reverted by `claude-reviewer`
  (force_count 1).
- `tasks/WP09-…/review-cycle-4.md`: REJECT — "live verification not executed"; `screenshot-loaded.png` and
  `notes.md` both missing at review time.
- Post-rejection state: ADRs 0006–0009 **present** in `.claude/adr/`; `screenshot-loaded.png` (1920×1080,
  genuine in-client capture) **added 2026-06-10 22:33** (after the 09:35 rejection); `notes.md` **still
  absent**; **no re-review occurred** — WP09 remains `planned`.

**Analysis**: The decision-documentation half (ADRs) is satisfied. The live-verification half is *partially*
remediated (real screenshot now exists, which is better than the repo's prior incidents) but not closed:
`notes.md` is missing, the checklist is unsigned, and WP09 was never re-submitted for review. Per
`SC-006`/charter, a load-bearing mission cannot merge with an open governance WP. Note: `.claude/` is
gitignored, so the ADRs are **not tracked** and would not travel with a merge — confirm they are meant to
live only locally (consistent with this repo's convention) or the decision record is lost on a fresh clone.

---

## Risk Findings

### RISK-1: Two divergent algorithm implementations; the shipped one bypasses WP02's tested detector
**Type**: DEAD-CODE / DUPLICATE-LOGIC / CROSS-WP
**Severity**: HIGH
**Location**: `lane-h:src/adapters/detection-scanner.ts` (inlined) vs `lane-b:src/domain/duplicate-detector.ts` (canonical)
**Trigger**: Any real scan in the wired app (lane-h) runs the **inlined** algorithm, never WP02's module.
**Evidence**:
- lane-h has **no** `duplicate-detector.ts` / `duplicate-key.ts` / `enriched-track-parser.ts` and **zero**
  `grep` hits for importing them anywhere under `src/`.
- lane-h `adapters/detection-scanner.ts` defines its own `const DURATION_TOLERANCE_MS = 2000` and an inline
  `seenByUri` / `seenByKey` matcher (`Math.abs(candidate.durationMs - track.durationMs) <= DURATION_TOLERANCE_MS`).
- The canonical WP02 detector (lane-b) is a separate `O(N)` implementation with its own 27 boundary-test
  references.

**Analysis**: Both implementations are *behaviorally correct at the 2000 ms boundary* (both inclusive `<=`),
so this is not an immediate correctness defect. But: (a) WP02's heavily-tested detector is **dead code** with
respect to the application — it ships nothing; (b) the algorithm now has two sources of truth that can drift
under future edits with no test linking them; (c) it violates the plan's own structure decision (algorithm
lives in `src/domain/duplicate-detector.ts` so it is unit-testable without a host — NFR-002) and C-006 SRP.
If the mission is integrated by taking lane-b's detector as canonical, lane-h's scanner must be rewritten to
import it, and lane-h's scanner tests re-pointed — work that was never done because integration never
happened.

### RISK-2: `tsc --noEmit` is not a real gate; lane-h has 3 type errors
**Type**: QUALITY-GATE-GAP (DIRECTIVE_030)
**Severity**: MEDIUM
**Location**: `lane-h` — `test/ui/{DedupButton,LikedSongsRow,PlaylistRow}.test.tsx`
**Evidence**: `npx tsc --noEmit` on lane-h emits 3× `TS2322`: scanner mock typed `Mock<() => Promise<unknown>>`
not assignable to `(…) => Promise<DetectionResult>`. The project's build is `spicetify-creator` (esbuild),
which **does not typecheck**, and there is no `typecheck` npm script; vitest transforms via esbuild too. So
strict-TypeScript (charter Quality) is enforced by neither build nor test runner.
**Analysis**: WP08 was approved despite 3 type errors because nothing in the pipeline runs `tsc`. The errors
are confined to test mocks (low runtime risk), but the charter's strict-TS gate is effectively unenforced —
a process hole that lets type drift through. Recommend a `tsc --noEmit` CI step before declaring DIRECTIVE_030
green (SC-006 claims "type-checking clean").

### RISK-3: NUL-byte separator stored literally in source (`detection-scanner.ts` flagged binary)
**Type**: SOURCE-HYGIENE
**Severity**: LOW
**Evidence**: `git diff` reports `src/adapters/detection-scanner.ts | Bin 0 -> 7787 bytes`; `git show … | grep`
returns nothing because the file embeds a literal `\0` (the `composeKey` separator). The working-tree file is
valid TS and tests pass.
**Analysis**: Functionally fine (the NUL is a deliberate, collision-proof key separator per data-model), but
storing it as a raw byte rather than the `' '` escape makes the file binary to git (no diffs/blame on the
algorithm), and is fragile across editors/encodings. Prefer `' '`.

---

## Silent Failure Candidates

| Location | Condition | Behavior | Spec impact |
|---|---|---|---|
| (none material found at lane level) | — | — | Per-lane error handling is explicit and typed; WP05 enricher classifies 401/403/404/500/503/network/shape with dedicated tests. The fail-loud parser (NFR-008) throws `DetectionError('malformed-enrichment-payload', …)` with a paired `isEnrichedTrack` classifier as required. |

No `except: pass` / silent-empty-return anti-patterns were found in the sampled adapters. The error taxonomy
is consistent (7 reasons) across every lane. This is a genuine strength of the per-WP work.

---

## Security Notes

| Finding | Location | Risk class | Note |
|---|---|---|---|
| Catalog URL built by string concat of track IDs | `spicetify-catalog-enricher.ts` (`/v1/tracks?ids=` + `chunk.map(id).join(',')`) | INJECTION (low) | IDs are extracted from `spotify:track:<id>` URIs already shape-validated upstream; values are catalog IDs, not free user text. Low risk, but no explicit ID-charset validation before interpolation — worth a `^[A-Za-z0-9]+$` guard. |
| Abort-aware `sleep` races `setTimeout` vs `'abort'` listener | `spicetify-catalog-enricher.ts` | LOCK/TOCTOU (n/a) | Read-only mission, no shared lock, no credentials cleared. WP05 review cycle 7 specifically hardened the `ms <= 0` short-circuit. No TOCTOU window of concern. |
| Mutation surface | entire mission | — | C-001 honored: the `DetectionScanner` port has no delete/remove method anywhere. No mutation risk. |

No blocking security findings. The mission is read-only by construction.

---

## Final Verdict

### FAIL (pre-merge)

**Rationale**: The individual work packages are, in isolation, strong — green suites (lane-h alone: 30 files /
625 tests), faithful FR coverage including the mandated duration boundary tests, a consistent typed-error
taxonomy, fail-loud parsing with paired classifiers, and a real (not mocked-up) live-verification screenshot.
However, the mission **cannot be accepted or merged in its current state** because of three blocking findings:

- **[DRIFT-1, CRITICAL]** There is no integrated artifact. Eight lanes hold 4–7 divergent private copies of
  the shared modules; the integration branch is empty; every "approved" review validated code that is not
  what would merge. The lane scheduler flattened a real dependency DAG into all-parallel, which forced the
  re-stubbing.
- **[RISK-1, HIGH]** The wired app (WP08/lane-h) ships an *inlined* re-implementation of the algorithm and
  does not include or import WP02's exhaustively-tested detector — which is therefore dead code relative to
  the product.
- **[DRIFT-2, HIGH]** WP09 is unfinished and was never re-reviewed: live-verification `notes.md` is missing,
  the WP sits in `planned`, and the ADRs (though written) live only in gitignored `.claude/`.

Any one of these blocks a clean merge; together they mean the mission needs an explicit **integration pass**
before it can be re-reviewed as a whole.

### Recommended path to GREEN (non-prescriptive)

1. **Define the real integration order** (WP01→WP02→WP03→WP04→{WP05,WP06}→WP07→WP08, WP09 last) and produce a
   single integration branch where each shared file has exactly one canonical version (lane-a domain types/
   errors/state; lane-b detector/key/parser; lane-c ports/retry-after; etc.).
2. **Rewire WP08's scanner** to import the canonical `duplicate-detector.ts` and delete the inlined copy
   (resolves RISK-1 and restores NFR-002/C-006). Re-point lane-h scanner tests at the composed detector.
3. **Run the full suite + 100% coverage gate on the integrated branch** (vitest.config already enforces
   100% lines/branches/functions/statements) and add a `tsc --noEmit` step (resolves RISK-2).
4. **Close WP09**: add `notes.md`, tick the checklist, re-submit for review, reach `approved`. Confirm the ADR
   placement convention (gitignored `.claude/`) is intended.
5. Re-run this mission review against the integrated branch.

### Open items (non-blocking, for follow-up)

- RISK-3: replace the literal NUL separator with `' '` so the algorithm file is text to git.
- Security: add an explicit catalog-ID charset guard before URL interpolation.
- Confirm whether ADRs being untracked (gitignored `.claude/`) is acceptable for decision-record durability
  on fresh clones.
</content>
