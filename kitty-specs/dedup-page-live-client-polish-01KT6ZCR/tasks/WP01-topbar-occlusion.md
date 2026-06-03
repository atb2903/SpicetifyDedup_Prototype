---
work_package_id: WP01
title: Topbar Occlusion Fix
dependencies: []
requirement_refs:
- FR-001
- FR-002
- NFR-007
- NFR-009
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
history:
- timestamp: '2026-06-03T19:01:12Z'
  actor: tasks-generator
  note: Initial work package created from plan.md WP-01 (P1 topbar occlusion).
authoritative_surface: src/ui/DedupPage
execution_mode: code_change
mission_slug: dedup-page-live-client-polish-01KT6ZCR
owned_files:
- src/ui/DedupPage.tsx
- src/ui/DedupPage.module.scss
- test/ui/DedupPage.test.tsx
- test/app.test.tsx
- README.md
priority: P1-HIGH
tags: []
---

# WP-01 — Topbar Occlusion Fix

**Closes**: spec §1 P1 (HIGH) — "Spotify's `.main-topBar-container` overlays the Dedup page's first interactive surface."
**Requirements**: FR-001, FR-002, NFR-009 (assertion must be automated, not manual). Also touches NFR-007 (README updated for user-visible change).
**Acceptance test (independent)**: real-mouse click on the Load button hits the button (not host chrome) on the first attempt; automated regression covers it inside `npm run test:run`.

This WP is the headline blocker for the mission. Without it, the Dedup page is unusable from a real mouse — the button is reachable only via `btn.click()` in DevTools. The fix is small (one CSS module, one wrapper className) but the test surface is the load-bearing piece: the regression must catch a regression *automatically*, no human-in-the-loop.

---

## Branch Strategy

- **Planning base / merge target**: `get_library` (per the mission's branch contract; matches ✅).
- **This lane's workspace and branch**: assigned by `spec-kitty agent mission finalize-tasks` (see `lanes.json`). Enter that workspace before editing.
- **Merge cadence**: this WP's lane merges back to `get_library` on done; no merges to `main` from this mission (C-004).

---

## Context — what the defect looks like

Live measurement on 2026-06-03 (spec §1 P1):

- Spotify's host chrome includes a `<header class="main-topBar-container">` that takes up the top ~110 px of the viewport.
- The Dedup page renders flush against the viewport top, so the Load button's center coordinates fall inside the topbar's bounding box.
- `document.elementFromPoint(buttonCenterX, buttonCenterY)` resolves to a topbar element, not the button.
- A real mouse click hits the topbar; `btn.click()` from DevTools works because it bypasses hit-testing.

The fix is to give the Dedup page its own scroll surface with a topbar-aware `padding-top`, so the button's center lands below the chrome.

**Critical guardrails** (from research.md §1 + spec assumption §6.1):

- **No selectors against Spotify's chrome class names** (`.main-topBar-container` etc.) in production CSS. Those classnames are hashed/rotating per Spicetify ecosystem research. The CSS rule must be self-contained on the Dedup page wrapper.
- The exact `padding-top` value comes from T001's live probe; commit it as the fallback in the CSS custom property `--dedup-topbar-offset`. The custom property allows future tuning without touching the component.
- The fix's shape (own scroll surface + padding-top) is plan-locked (research §1 Decision). Sticky-header / Spicetify slot alternatives were explicitly rejected.

---

## Subtasks

### T001 — Live probe: measure topbar bottom + button hit-target

**Purpose**: confirm the fallback `padding-top` value before T004 writes it into the CSS module.

**Steps**:
1. Open Spotify with Spicetify applied (current `~/.config/spicetify/CustomApps/spicetify-dedup/`).
2. Navigate to the Dedup page via the sidebar.
3. Open DevTools (Spotify exposes them at `--remote-debugging-port=9222`).
4. Paste the snippet from `research.md` §1 (live-probe checkpoint).
5. Record: the topbar's `bottom` value (this becomes the `--dedup-topbar-offset` fallback), and the `centerHitTarget` (confirms the current defect).
6. Write the recorded values into the WP working notes (`kitty-specs/.../tasks/WP01-topbar-occlusion.notes.md` or similar — agent's choice).

**Validation**: notes contain `topbarRect.bottom` (numeric, e.g. `110`) and confirm `centerHitTarget` is a `.main-topBar-*` element (not the button).

**Output**: probe value drives T004's fallback.

---

### T002 — Failing test: faux topbar occludes Load button center (FR-001, FR-002, NFR-009)

**Purpose**: encode the FR-001 contract — "Load button center is not occluded by host chrome" — as an automated assertion that fails on the current `DedupPage`.

**File**: `test/ui/DedupPage.test.tsx` (existing file — extend; do not replace existing tests).

**Steps**:
1. Add a new test case `it('FR-001 — Load button is not occluded by faux topbar overlay', …)`.
2. In the test body:
   - Set `document.body.innerHTML` to render a faux `<header class="main-topBar-container">` with `position: fixed; top: 0; height: <probe value>px; z-index: 999;` plus a `<div id="root">`.
   - Render `<DedupPage />` inside a `PlaylistsStoreProvider` (use a fake store in idle state).
   - Query the Load button via `screen.getByRole('button', { name: /load/i })`.
   - Compute `cx = r.left + r.width/2; cy = r.top + r.height/2`.
   - Assert `document.elementFromPoint(cx, cy)` is the button or a descendant.
3. **Run the test — it MUST fail on the current code** (no wrapper, no padding-top). Capture the failure output and note it in the commit message for traceability (NFR-001).

**Fallback shape** (research §4): if happy-dom's `elementFromPoint` does not honor fixed-position stacking-context fidelity, swap to a computed-style overlap check:
```ts
const overlaps =
  r.left < topbar.right && r.right > topbar.left &&
  r.top < topbar.bottom && r.bottom > topbar.top;
expect(overlaps).toBe(false);
```
Pick whichever assertion shape gives a clean fail-then-pass cycle. Both encode the same contract.

**Validation**: `npm run test:run` reports this one test failing on the current tree with a clear, non-flaky failure mode.

**Commit**: failing-test commit precedes the fix commit (NFR-001).

---

### T003 — App smoke regression for clickable Load button

**Purpose**: belt-and-suspenders test in `test/app.test.tsx` that confirms the full mounted `App` (with production wiring) renders a wrapper element that owns the scroll surface.

**File**: `test/app.test.tsx` (existing — extend).

**Steps**:
1. Add `it('FR-001 — App renders DedupPage inside a scroll surface wrapper', …)`.
2. Render `<App />`, query the DedupPage root element (find by role/test-id or by querying for the wrapper class via CSS-module-aware selectors).
3. Assert the wrapper has a computed `overflow-y: auto` (or `scroll`) and a non-zero `padding-top`.
4. This test asserts the wiring (T005) rather than the geometry (T002); the two tests bracket the contract from both ends.

**Validation**: test runs in `npm run test:run`; fails on current code (no wrapper), passes after T005.

---

### T004 — Create `src/ui/DedupPage.module.scss` with scroll surface + padding-top

**Purpose**: ship the scroll surface CSS.

**File**: `src/ui/DedupPage.module.scss` (NEW).

**Content sketch** (use the probe value from T001 as the fallback):
```scss
.page {
  height: 100%;
  overflow-y: auto;
  padding-top: var(--dedup-topbar-offset, <probe>px);
  padding-inline: 24px;
  padding-bottom: 24px;
  box-sizing: border-box;
}
```

**Guardrails**:
- **No selectors against `.main-*` or any Spotify chrome class**. The rule must be self-contained.
- `box-sizing: border-box` so the padding does not push content off the right edge.
- The `padding-inline: 24px` value matches the scaffold's existing inline padding; adjust if T001's probe surfaces a different host-margin expectation.
- One file; one selector. SRP per the charter.

**Validation**: the file lints cleanly under the SCSS build; `npm run build` succeeds.

---

### T005 — Wire `DedupPage.tsx` to use the module class on root wrapper

**Purpose**: import the CSS module and render a `<div className={styles.page}>` wrapper around the existing `switch`.

**File**: `src/ui/DedupPage.tsx` (existing — minor edit).

**Steps**:
1. Add `import styles from './DedupPage.module.scss';` at the top.
2. Wrap the existing `switch (kind) { … }` in `<div className={styles.page}>{ … }</div>`. The switch's children stay identical.
3. Update the file's JSDoc header to note the scroll surface contribution and reference FR-001.

**Architecture compliance**: `src/ui/` already imports CSS modules per the existing scaffold; no new imports cross hexagonal boundaries.

**Validation**: T002 and T003 transition from failing → passing.

---

### T006 — README user-visible change note (NFR-007 portion)

**Purpose**: keep README current per any user-visible change (NFR-007). The Load button being clickable is a user-visible behavior change.

**File**: `README.md` (existing).

**Steps**:
1. In the section that describes the current Dedup page surface (or add a short "Status" subsection if none exists), add one line: "The Dedup page now hosts its own scroll surface so the Load button stays below Spotify's topbar — click it with a real mouse to start a load."
2. Keep the edit minimal; do not restructure the README.

**Validation**: README diff appears in the merge commit; lines are concise; no dead links introduced.

---

## Definition of Done

This WP is done when **all** of the following hold:

1. T001 probe values recorded; T002 and T003 written, observed failing, then green after T005.
2. `npm run test:run` exits 0 with the new tests included.
3. `npm run typecheck` exits 0.
4. `npm run test:coverage` reports `lines: 100%` and `branches: 100%`.
5. Architecture test green (no new `ui` → `adapters`/`ports` imports).
6. README change committed.
7. JSDoc on the updated `DedupPage.tsx` reflects the new responsibility (NFR-008).
8. Per NFR-001: in the WP's commit history, the failing-test commit precedes the implementation commit.

The implementing agent runs the spec-kitty handoff commands (per the host CLI's `WHEN DONE` instructions) so the lane's state advances and review can begin.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| happy-dom `elementFromPoint` does not honor fixed-position stacking | Fall back to the computed-style overlap check (research §4). Both shapes encode the same contract; pick the one that gives a clean fail-then-pass on the local machine. |
| Probe value from T001 differs across Spotify builds (assumption §6.1) | The CSS custom property `--dedup-topbar-offset` lets a future iteration override the value without code change. T001's value is the fallback, not a hard pin. |
| Test relies on hashed Spotify classnames | Forbidden — research §1. Tests must use stable selectors (role-based queries, test-only fixture classes). |

---

## Reviewer Guidance

A reviewer should check:

1. **NFR-001**: failing test commit precedes the fix commit in this WP's history.
2. **FR-001 contract**: the test in T002 fails on `main` (before this WP) — confirm by checking the test against the pre-WP tree, or by reasoning through the test against the previous `DedupPage.tsx`.
3. **No hashed Spotify classnames** in production CSS. The CSS rule is self-contained on `.page`.
4. **No regression**: existing `DedupPage.test.tsx` tests still pass (the wrapper does not break view routing).
5. **JSDoc** on `DedupPage.tsx` reflects the new responsibility (NFR-008).
6. **README** diff is present and minimal (NFR-007).
7. **Coverage** at 100/100 (NFR-002).

---

## Out of Scope (do NOT do in this WP)

- Styling the inner views (covered by WP-02).
- Touching the store or any FSM state (covered by WP-03 / WP-05).
- Adopting any Spicetify-provided slot component as the page chrome (rejected by research §1).
- Adding theme tokens or `--spice-*` variables (covered by WP-02 in `_tokens.module.scss`).
- Animating the scroll transition (out of mission scope per spec §7).
