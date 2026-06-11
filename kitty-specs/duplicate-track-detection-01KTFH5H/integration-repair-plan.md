# Duplicate-Track-Detection — Integration Repair Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or
> superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the 8 independently-developed lane branches of mission
`duplicate-track-detection-01KTFH5H` into one coherent, green, mergeable result, then close out WP09 and
merge to `main`.

**Architecture:** Owner-lane-wins reconciliation. Each shared source/test file is taken verbatim from the
lane that declared it in its `write_scope` (`lanes.json`); every other lane's re-stubbed copy is discarded.
Assembly happens on a fresh integration branch off `main`; the aggregate Vitest suite + `tsc --noEmit` +
`build-local` are the gates. No algorithm is rewritten — the canonical WP04 composition adapter already
imports the real WP02 detector, so RISK-1 dissolves by simply not taking lane-h's inlined copy.

**Tech Stack:** TypeScript 6 (strict), React 19, Zustand 5, Vitest 4 + happy-dom, spicetify-creator (esbuild).

**Scope (from interview):** Repair-in-place · Comprehensive · Owner-lane-wins.

---

## Decisions locked

- **D1 — Repair in place.** No new spec-kitty mission. We integrate the existing mission's lanes and merge it.
- **D2 — Owner-lane-wins.** Canonical source = the lane whose `write_scope` lists the file.
- **D3 — Comprehensive.** Includes: integrate to green; ensure the real detector ships (RISK-1); add a real
  `tsc` gate (RISK-2); replace the literal-NUL separator (RISK-3); finish WP09 (`notes.md` + re-review);
  then merge.

## Canonical file map (owner-lane-wins)

Derived from `lanes.json` `write_scope`. This is the **complete** set of mission files and their canonical
source branch. `kitty/mission-…-lane-X` abbreviated to `lane-X`.

| Canonical source file | Owner |
|---|---|
| `src/domain/detection-errors.ts` + `test/domain/detection-errors.test.ts` | lane-a |
| `src/domain/detection-state.ts` + `test/domain/detection-state.test.ts` | lane-a |
| `src/domain/detection-types.ts` | lane-a |
| `src/domain/duplicate-detector.ts` + `test/domain/duplicate-detector.test.ts` | lane-b |
| `src/domain/duplicate-key.ts` + `test/domain/duplicate-key.test.ts` | lane-b |
| `src/domain/enriched-track-parser.ts` + `test/domain/enriched-track-parser.test.ts` | lane-b |
| `src/adapters/retry-after.ts` + `test/adapters/retry-after.test.ts` | lane-c |
| `src/ports/catalog-enricher.ts` | lane-c |
| `src/ports/detection-scanner.ts` | lane-c |
| `src/ports/tracks-enumerator.ts` | lane-c |
| `src/adapters/detection-scanner.ts` + `test/adapters/detection-scanner.test.ts` | lane-d |
| `src/adapters/fake-catalog-enricher.ts` + `test/adapters/fake-catalog-enricher.test.ts` | lane-d |
| `src/adapters/fake-tracks-enumerator.ts` + `test/adapters/fake-tracks-enumerator.test.ts` | lane-d |
| `src/adapters/spicetify-catalog-enricher.ts` + `test/adapters/spicetify-catalog-enricher.test.ts` | lane-e |
| `src/adapters/spicetify-tracks-enumerator.ts` + `test/adapters/spicetify-tracks-enumerator.test.ts` | lane-e |
| `src/store/detection-store.ts` + `test/store/detection-store.test.ts` | lane-f |
| `src/store/DetectionStoreContext.tsx` + `test/store/DetectionStoreContext.test.tsx` | lane-f |
| `src/store/RouteResetContext.tsx` + `test/store/RouteResetContext.test.tsx` | lane-f |
| `test/integration/detection-end-to-end.test.ts` | lane-f |
| `src/ui/ScanningView.tsx` + `.module.scss` + `test/ui/ScanningView.test.tsx` | lane-g |
| `src/ui/DetectionLoadedSummary.tsx` + `.module.scss` + `test/ui/DetectionLoadedSummary.test.tsx` | lane-g |
| `src/ui/DetectionFailedView.tsx` + `.module.scss` + `test/ui/DetectionFailedView.test.tsx` | lane-g |
| `src/app.tsx` + `test/app.test.tsx` | lane-h |
| `src/ui/DedupButton.tsx` + `test/ui/DedupButton.test.tsx` | lane-h |
| `src/ui/LikedSongsRow.tsx` + `test/ui/LikedSongsRow.test.tsx` | lane-h |
| `src/ui/PlaylistRow.tsx` + `test/ui/PlaylistRow.test.tsx` | lane-h |
| `src/ui/dedup-click-log.ts` + `test/ui/dedup-click-log.test.ts` | **DELETE** (lane-h removes both) |
| `test/ui/DedupPage.test.tsx`, `test/ui/LoadedView.test.tsx` | lane-h (updated pre-existing tests) |

**Known conflict — `RouteResetContext.tsx` + its test:** both lane-f (owner) and lane-h modified them.
Owner-lane-wins → **lane-f**. Risk: lane-h's `app.tsx`/rows may assume lane-h's RouteReset variant. Verified
at build time in Phase 2; reconcile per Task 6 if it breaks.

**Pre-existing files NOT owned by any lane** (must remain as on `main` unless a build error forces a change):
everything else under `src/` (`DedupPage.tsx`, `LoadedView.tsx`, `playlists-store.ts`, loaders, types, etc.).

---

## Phase 0 — Safety net & integration workspace

### Task 0: Snapshot current state and create the integration branch

**Files:** none (git only).

- [ ] **Step 1: Confirm clean tree on `main` and record current SHA**

Run:
```bash
cd /home/alex/Documents/repos/SpicetifyDedup_Prototype
git status --short
git rev-parse main
```
Expected: working tree has only the known untracked review artifacts; note the `main` SHA as the rollback point.

- [ ] **Step 2: Create the integration branch off `main`**

Run:
```bash
git branch kitty/mission-duplicate-track-detection-01KTFH5H-integration main
git worktree add .worktrees/duplicate-track-detection-01KTFH5H-integration \
  kitty/mission-duplicate-track-detection-01KTFH5H-integration
```
Expected: new worktree created. All integration work happens here; `main` is never touched until merge.

- [ ] **Step 3: Install deps in the integration worktree if needed**

Run:
```bash
cd .worktrees/duplicate-track-detection-01KTFH5H-integration
[ -d node_modules ] || npm ci
npm run test:run 2>&1 | tail -5
```
Expected: baseline (pre-mission) suite is green — confirms the worktree is sound before we add files.

---

## Phase 1 — Assemble the canonical file set (owner-lane-wins)

All commands run from the integration worktree
(`.worktrees/duplicate-track-detection-01KTFH5H-integration`). `git checkout <branch> -- <paths>` copies a
file from a branch into the working tree+index without switching branches.

### Task 1: Pull WP01 + WP02 + WP03 (domain + ports + retry-after)

**Files:** domain & ports per the canonical map (lanes a/b/c).

- [ ] **Step 1: Checkout lane-a (WP01) files**

```bash
B=kitty/mission-duplicate-track-detection-01KTFH5H
git checkout $B-lane-a -- \
  src/domain/detection-errors.ts src/domain/detection-state.ts src/domain/detection-types.ts \
  test/domain/detection-errors.test.ts test/domain/detection-state.test.ts
```

- [ ] **Step 2: Checkout lane-b (WP02) files**

```bash
git checkout $B-lane-b -- \
  src/domain/duplicate-detector.ts src/domain/duplicate-key.ts src/domain/enriched-track-parser.ts \
  test/domain/duplicate-detector.test.ts test/domain/duplicate-key.test.ts \
  test/domain/enriched-track-parser.test.ts
```

- [ ] **Step 3: Checkout lane-c (WP03) files**

```bash
git checkout $B-lane-c -- \
  src/adapters/retry-after.ts \
  src/ports/catalog-enricher.ts src/ports/detection-scanner.ts src/ports/tracks-enumerator.ts \
  test/adapters/retry-after.test.ts
```

- [ ] **Step 4: Run the domain+ports slice in isolation**

```bash
npx vitest run test/domain/detection-errors.test.ts test/domain/detection-state.test.ts \
  test/domain/duplicate-detector.test.ts test/domain/duplicate-key.test.ts \
  test/domain/enriched-track-parser.test.ts test/adapters/retry-after.test.ts 2>&1 | tail -8
```
Expected: PASS. This slice has no cross-lane seams, so it must be green immediately. If `enriched-track-parser`
or `retry-after` fail to import a domain type, that signals a lane-a↔lane-b/c type drift — reconcile by
trusting lane-a's `detection-types.ts`/`detection-errors.ts` (the owners) and adjusting nothing else yet;
note the drift for Task 6.

- [ ] **Step 5: Commit the foundation**

```bash
git add -A
git commit -m "integ: assemble WP01-03 canonical domain+ports (owner-lane-wins)"
```

### Task 2: Pull WP04 (fakes + composition adapter) and verify the detector seam

**Files:** `src/adapters/{detection-scanner,fake-catalog-enricher,fake-tracks-enumerator}.ts` + tests (lane-d).

- [ ] **Step 1: Checkout lane-d (WP04) owned files only** (NOT lane-d's copies of domain/ports — those stay from a/b/c)

```bash
git checkout $B-lane-d -- \
  src/adapters/detection-scanner.ts src/adapters/fake-catalog-enricher.ts \
  src/adapters/fake-tracks-enumerator.ts \
  test/adapters/detection-scanner.test.ts test/adapters/fake-catalog-enricher.test.ts \
  test/adapters/fake-tracks-enumerator.test.ts
```

- [ ] **Step 2: Confirm the composition adapter imports the REAL detector (RISK-1 gate)**

```bash
grep -n "duplicate-detector" src/adapters/detection-scanner.ts
```
Expected: `import { detect } from '../domain/duplicate-detector';` present. This is the line that makes the
shipped pipeline use WP02's tested algorithm. If absent, STOP — owner map is wrong.

- [ ] **Step 3: Run the WP04 slice**

```bash
npx vitest run test/adapters/detection-scanner.test.ts \
  test/adapters/fake-catalog-enricher.test.ts test/adapters/fake-tracks-enumerator.test.ts 2>&1 | tail -10
```
Expected: PASS. Seam risk: lane-d's `detection-scanner.ts` imports `EnrichmentSlot` from
`ports/catalog-enricher.ts` (owned by lane-c). If lane-c's port does not export `EnrichmentSlot` with the
shape lane-d expects, this fails. Resolution if it fails: compare
`git show $B-lane-c:src/ports/catalog-enricher.ts` vs `git show $B-lane-d:src/ports/catalog-enricher.ts`;
the type contract must be reconciled on the **owner (lane-c)** file — port the missing export/field into
lane-c's version (record as a reconciliation edit in Task 6), never by reverting to lane-d's port copy.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "integ: assemble WP04 fakes + composition adapter; detector seam verified"
```

### Task 3: Pull WP05 (Spicetify adapters)

**Files:** `src/adapters/spicetify-{tracks-enumerator,catalog-enricher}.ts` + tests (lane-e).

- [ ] **Step 1: Checkout lane-e owned files**

```bash
git checkout $B-lane-e -- \
  src/adapters/spicetify-tracks-enumerator.ts src/adapters/spicetify-catalog-enricher.ts \
  test/adapters/spicetify-tracks-enumerator.test.ts test/adapters/spicetify-catalog-enricher.test.ts
```

- [ ] **Step 2: Run the WP05 slice**

```bash
npx vitest run test/adapters/spicetify-tracks-enumerator.test.ts \
  test/adapters/spicetify-catalog-enricher.test.ts 2>&1 | tail -10
```
Expected: PASS. Seam risk: lane-e's enricher imports `parseRetryAfter`/`isRetryAfterParseError` from
`adapters/retry-after.ts` (owner lane-c) and `asEnrichedTrack` from `enriched-track-parser.ts` (owner lane-b),
and the ports from lane-c. If a symbol name/shape mismatches, reconcile on the **owner** file and note in
Task 6. (lane-e also depends on `src/types/spicetify-platform.d.ts` — pre-existing on `main`; if lane-e added
fields to it, checkout lane-e's version of that .d.ts too.)

- [ ] **Step 3: Check whether lane-e extended the Spicetify platform typings**

```bash
git diff main $B-lane-e -- src/types/spicetify-platform.d.ts --stat
```
If non-empty: `git checkout $B-lane-e -- src/types/spicetify-platform.d.ts` (typings are additive, safe).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "integ: assemble WP05 Spicetify adapters"
```

### Task 4: Pull WP06 (store + context + route-reset + integration test)

**Files:** `src/store/{detection-store.ts,DetectionStoreContext.tsx,RouteResetContext.tsx}` +
`test/integration/detection-end-to-end.test.ts` + store tests (lane-f).

- [ ] **Step 1: Checkout lane-f owned files**

```bash
git checkout $B-lane-f -- \
  src/store/detection-store.ts src/store/DetectionStoreContext.tsx src/store/RouteResetContext.tsx \
  test/store/detection-store.test.ts test/store/DetectionStoreContext.test.tsx \
  test/store/RouteResetContext.test.tsx test/integration/detection-end-to-end.test.ts
```

- [ ] **Step 2: Run the store + integration slice**

```bash
npx vitest run test/store/detection-store.test.ts test/store/DetectionStoreContext.test.tsx \
  test/store/RouteResetContext.test.tsx test/integration/detection-end-to-end.test.ts 2>&1 | tail -12
```
Expected: PASS. The integration test composes `createDetectionScanner(fakeEnumerator, fakeEnricher)` +
`createDetectionStore` — it exercises the lane-d scanner + lane-d fakes + lane-a/b domain together, so it is
the first real cross-lane proof. Seam risk: lane-f's `detection-store.ts` imports the `DetectionScanner` port
(lane-c) and `transition`/`DetectionState` (lane-a). Reconcile mismatches on owner files; note in Task 6.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "integ: assemble WP06 store + route-reset + end-to-end integration test"
```

### Task 5: Pull WP07 (UI views) and WP08 (wiring + rows + app), delete dead file

**Files:** lane-g views + lane-h app/rows/button; delete `dedup-click-log.*`.

- [ ] **Step 1: Checkout lane-g (WP07) views**

```bash
git checkout $B-lane-g -- \
  src/ui/ScanningView.tsx src/ui/ScanningView.module.scss \
  src/ui/DetectionLoadedSummary.tsx src/ui/DetectionLoadedSummary.module.scss \
  src/ui/DetectionFailedView.tsx src/ui/DetectionFailedView.module.scss \
  test/ui/ScanningView.test.tsx test/ui/DetectionLoadedSummary.test.tsx test/ui/DetectionFailedView.test.tsx
```

- [ ] **Step 2: Checkout lane-h (WP08) wiring, rows, and updated pre-existing tests**

```bash
git checkout $B-lane-h -- \
  src/app.tsx src/ui/DedupButton.tsx src/ui/LikedSongsRow.tsx src/ui/PlaylistRow.tsx \
  test/app.test.tsx test/ui/DedupButton.test.tsx test/ui/LikedSongsRow.test.tsx \
  test/ui/PlaylistRow.test.tsx test/ui/DedupPage.test.tsx test/ui/LoadedView.test.tsx
```

- [ ] **Step 3: Delete the dead `dedup-click-log` module + test (RISK / cleanup)**

```bash
git rm src/ui/dedup-click-log.ts test/ui/dedup-click-log.test.ts
```
Expected: removed. (lane-h dropped this; nothing else imports it — verify with
`grep -rn dedup-click-log src test` → no hits.)

- [ ] **Step 4: Confirm lane-h's inlined algorithm is NOT present (RISK-1 final gate)**

```bash
grep -rn "DURATION_TOLERANCE_MS" src/adapters/detection-scanner.ts
grep -rn "duplicate-detector" src/adapters/detection-scanner.ts
```
Expected: the file is lane-d's (imports `duplicate-detector`, **no** local `DURATION_TOLERANCE_MS`). lane-h's
inlined variant must NOT have overwritten it. If `DURATION_TOLERANCE_MS` appears, re-checkout lane-d's version
(`git checkout $B-lane-d -- src/adapters/detection-scanner.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "integ: assemble WP07 views + WP08 wiring; drop dead dedup-click-log"
```

---

## Phase 2 — Moment of truth: full suite + typecheck + build

### Task 6: Green the integrated whole

**Files:** whatever the failures point to (reconcile on **owner** files only).

- [ ] **Step 1: Run the FULL suite**

```bash
npm run test:run 2>&1 | tail -30
```
Expected eventually: all files pass. On first run, expect possible cross-lane failures concentrated in
`app.test.tsx`, `PlaylistRow/LikedSongsRow/DedupButton.test.tsx`, and `RouteResetContext.test.tsx` (the seams
where lane-h's components meet lane-f's store + lane-g's views).

- [ ] **Step 2: Triage each failure with this decision rule**

For every failing test, classify the root cause and resolve **without** reintroducing a non-owner copy:
  - **Symbol/shape mismatch at a seam** (e.g. a prop name, an exported type field, a store selector key
    differs between the owner producer and the lane-h consumer): fix the **consumer** (lane-h component or
    its test) to match the **owner**'s contract. The owner's public surface is authoritative.
  - **A genuinely missing export** the owner forgot but a consumer needs: add it to the **owner** file.
  - **RouteResetContext divergence:** keep lane-f's `RouteResetContext.tsx`; if lane-h's `app.tsx` wires it
    differently, adapt `app.tsx` to lane-f's provider API.
  - Record every such edit as a bullet in a running `## Reconciliation log` you append to this plan file.

- [ ] **Step 3: Re-run the full suite until green**

```bash
npm run test:run 2>&1 | tail -8
```
Expected: `Test Files  NN passed`, `Tests  NNN passed`, 0 failed.

- [ ] **Step 4: Enforce 100% coverage (NFR-009 / SC-006)**

```bash
npm run test:coverage 2>&1 | tail -25
```
Expected: PASS with no threshold violations (config already sets lines/branches/functions/statements = 100).
If a new uncovered line appears at a seam, add the missing case to the **owner**'s test file.

- [ ] **Step 5: Commit the reconciliation**

```bash
git add -A && git commit -m "integ: reconcile cross-lane seams; full suite + 100% coverage green"
```

### Task 7: Add a real `tsc` gate (RISK-2) and make it pass

**Files:** `package.json` (add script), plus any type fixes the gate surfaces.

- [ ] **Step 1: Add a `typecheck` script**

In `package.json` `"scripts"`, add:
```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2: Run it**

```bash
npm run typecheck 2>&1 | tail -30
```
Expected initially: the 3 known `TS2322` errors in `DedupButton.test.tsx`, `LikedSongsRow.test.tsx`,
`PlaylistRow.test.tsx` (scanner mock typed `Promise<unknown>` vs `Promise<DetectionResult>`), plus any seam
types from Task 6.

- [ ] **Step 3: Fix the mock typings**

In each of the three test files, type the scanner mock's resolved value as `DetectionResult` (import the type
from `../../src/domain/detection-types`) so `vi.fn()` infers `Promise<DetectionResult>`, e.g.:
```ts
const scan = vi.fn<DetectionScanner['scan']>(async () => fakeResult);
```
(Use the project's existing `DetectionResult` fixture in that test; do not invent a new shape.)

- [ ] **Step 4: Re-run typecheck to green**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: no output / exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: add tsc --noEmit typecheck gate (RISK-2) and fix mock typings"
```

### Task 8: Replace the literal-NUL key separator (RISK-3)

**Files:** `src/adapters/detection-scanner.ts` (and `src/domain/duplicate-key.ts` if it also stores a raw NUL).

- [ ] **Step 1: Locate raw NUL bytes in source**

```bash
grep -rlP "\x00" src/ || echo "no raw NUL bytes"
```
Expected: lists `detection-scanner.ts` (flagged binary earlier) and possibly `duplicate-key.ts`.

- [ ] **Step 2: Replace the literal NUL with the `' '` escape**

In each listed file, change the separator constant from a raw embedded NUL to the explicit escape:
```ts
const SEPARATOR = ' ';
```
Keep the value semantically identical (still U+0000) so `composeKey` output is unchanged — only the on-disk
representation becomes plain text. **Do not** change the join character to a printable one (that would weaken
the collision guarantee the data-model requires).

- [ ] **Step 3: Verify the files are now text and tests still pass**

```bash
grep -rlP "\x00" src/ || echo "no raw NUL bytes remain"
npx vitest run test/domain/duplicate-key.test.ts test/adapters/detection-scanner.test.ts 2>&1 | tail -6
```
Expected: no NUL bytes remain; tests PASS (key composition behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "fix: store key separator as \\u0000 escape, not raw NUL byte (RISK-3)"
```

### Task 9: Production build smoke

**Files:** none.

- [ ] **Step 1: Build the extension bundle**

```bash
npm run build-local 2>&1 | tail -15
```
Expected: build succeeds, emits `dist/`. This is the only check that the esbuild path (which differs from
vitest's transform) accepts the integrated tree.

- [ ] **Step 2: Commit nothing (build output is gitignored); record success in the reconciliation log.**

---

## Phase 3 — Close WP09 (governance + live verification)

### Task 10: Finish the live-verification artefact

**Files:** `kitty-specs/duplicate-track-detection-01KTFH5H/live-verification/notes.md` (create);
confirm `screenshot-loaded.png` shows a loaded summary.

- [ ] **Step 1: Confirm/replace the screenshot shows a non-zero loaded summary**

Re-open `live-verification/screenshot-loaded.png`. The WP09 DoD requires the **loaded-summary** state with a
non-zero duplicate-group count visible. The existing capture shows the row list with Dedup buttons; if the
summary (e.g. "N groups · M tracks to remove") is not clearly visible, re-capture after running the rebuilt
extension (`build-local` from Task 9 → `spicetify config custom_apps spicetify-dedup && spicetify apply` →
click a row known to contain duplicates → screenshot). Overwrite `screenshot-loaded.png`.

> If Spicetify is not installed in this environment, this step requires the user (suggest they run the build +
> `spicetify apply` via `! <command>` in-session) or a documented teammate handoff. Do not fabricate the
> screenshot.

- [ ] **Step 2: Write `notes.md`**

Create `kitty-specs/duplicate-track-detection-01KTFH5H/live-verification/notes.md` documenting: which
collection was scanned, the displayed group/track counts, environment (client version, OS), date, and
anything surprising. Tick the `checklist.md` boxes that were actually performed.

- [ ] **Step 3: Commit**

```bash
cd /home/alex/Documents/repos/SpicetifyDedup_Prototype   # main worktree owns kitty-specs
git add kitty-specs/duplicate-track-detection-01KTFH5H/live-verification/
git commit -m "docs(WP09): add live-verification notes + loaded-summary screenshot"
```
(The four ADRs 0006–0009 already exist in gitignored `.claude/adr/`; confirm with `ls .claude/adr/`. Per repo
convention `.claude/` is intentionally untracked — no action unless the user wants ADRs tracked.)

---

## Phase 4 — Land it through spec-kitty

### Task 11: Drive WP09 to approved and merge the mission

> spec-kitty subcommands mutate runtime state — run them deliberately, one at a time, reading status between.
> Do NOT run them speculatively.

- [ ] **Step 1: Get the integration branch onto the mission branch**

The mission branch `kitty/mission-duplicate-track-detection-01KTFH5H` is currently empty of mission code.
Fast-forward / reset it to the integration branch so `spec-kitty merge` has the real tree:
```bash
git branch -f kitty/mission-duplicate-track-detection-01KTFH5H \
  kitty/mission-duplicate-track-detection-01KTFH5H-integration
```
(Confirm with the user before this — it rewrites the mission branch ref.)

- [ ] **Step 2: Re-review WP09 and advance its lane**

Use the spec-kitty review surface to move WP09 `planned → for_review → approved` now that `notes.md` +
screenshot exist (`/spec-kitty.review` for WP09, or the runtime-review skill). Verify
`status.json` shows WP09 `approved` and summary `approved: 9`.

- [ ] **Step 3: Merge the mission**

```bash
# /spec-kitty.merge --mission duplicate-track-detection-01KTFH5H  (or the skill)
```
Expected: mission branch merges into `main`; WPs reach `done`. Confirm `main` now contains all detection
source files (`ls src/domain/duplicate-detector.ts` etc.).

- [ ] **Step 4: Post-merge gate — full suite + typecheck + build on `main`**

```bash
cd /home/alex/Documents/repos/SpicetifyDedup_Prototype
npm run test:run 2>&1 | tail -6 && npm run typecheck 2>&1 | tail -3 && npm run build-local 2>&1 | tail -5
```
Expected: all green on `main`.

- [ ] **Step 5: Clean up integration + lane worktrees/branches**

```bash
git worktree remove .worktrees/duplicate-track-detection-01KTFH5H-integration
for l in a b c d e f g h; do
  git worktree remove .worktrees/duplicate-track-detection-01KTFH5H-lane-$l
  git branch -D kitty/mission-duplicate-track-detection-01KTFH5H-lane-$l
done
git branch -D kitty/mission-duplicate-track-detection-01KTFH5H-integration
```
(Only after a confirmed-green merge.)

- [ ] **Step 6: Re-run the mission review** (`spec-kitty-mission-review`) against merged `main` to confirm the
  FAIL findings are all resolved (DRIFT-1 integrated, RISK-1 real detector ships, DRIFT-2 WP09 done, RISK-2/3
  fixed). Target verdict: PASS.

---

## Self-review against the mission-review FAIL findings

| Finding | Addressed by |
|---|---|
| DRIFT-1 (no integration; N divergent copies) | Phase 1 + Task 6 — single owner-lane-wins tree, full green suite |
| RISK-1 (inlined algorithm ships, real detector dead) | Task 2 Step 2 + Task 5 Step 4 — canonical lane-d adapter imports real detector; inlined copy discarded |
| DRIFT-2 (WP09 unfinished) | Task 10 + Task 11 Step 2 — notes.md + screenshot + WP09 approved |
| RISK-2 (no tsc gate; 3 type errors) | Task 7 — `typecheck` script added + errors fixed |
| RISK-3 (raw NUL separator) | Task 8 — `' '` escape |
| Coverage / boundary tests (NFR-003/009) | Task 6 Step 4 — 100% coverage gate; lane-b boundary tests carried verbatim |

**Open risk acknowledged:** Phase 2 reconciliation is discovery-driven — exact seam fixes can't be fully
pre-written because they depend on the first cross-lane build. Task 6's decision rule (fix the consumer to the
owner's contract; record every edit) bounds that work and keeps owner-lane-wins intact.
