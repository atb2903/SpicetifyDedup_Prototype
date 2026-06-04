---
work_package_id: WP03
title: ADR-0004 supersession + ADR-0005 creation
dependencies: []
requirement_refs:
- FR-007
- FR-008
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T012
- T013
- T014
history:
- timestamp: '2026-06-04T20:07:25Z'
  actor: tasks
  note: Authored by /spec-kitty.tasks
authoritative_surface: .claude/adr/
execution_mode: planning_artifact
mission_slug: dedup-navigation-reset-hotfix-01KT9NSW
owned_files:
- .claude/adr/0004-navigation-port.md
- .claude/adr/0005-react-lifecycle-reset.md
priority: P1
tags: []
---

# WP03 — ADR-0004 supersession + ADR-0005 creation

## Objective

Honor DIRECTIVE_003 (decision documentation) and C-007 (reversed-not-amended) by:

1. Flipping ADR-0004's status header and appending a `## Supersession` section that explains the live-client evidence that invalidated its rationale.
2. Creating a new ADR-0005 file that documents the React-lifecycle reset decision.

After this WP merges, the ADR history reads end-to-end: ADR-0004 documents the original navigation-port direction (preserved word-for-word per C-007) with a clear supersession marker; ADR-0005 documents the lifecycle-based replacement with the diagnostic evidence and alternatives considered.

## Branch Strategy

- **Planning base**: `get_library`
- **Merge target**: `get_library`
- **Execution worktree**: allocated by `finalize-tasks` (`lanes.json`).
- **Dependencies**: none. WP03 runs in parallel with WP01/WP02/WP04/WP05.
- **Implementation entry command**: `spec-kitty agent action implement WP03 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`

## Context

### Authoritative references (READ THESE BEFORE STARTING)

1. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/contracts/adr-supersession.md`** — this is the **literal contract** for both file changes. §1 specifies the ADR-0004 edits; §2 specifies the ADR-0005 structure and required references; §3 specifies verification.
2. **`.claude/adr/0004-navigation-port.md`** — read end-to-end. The body (Context, Decision, Consequences, Alternatives, Implementation notes) MUST remain word-for-word per C-007.
3. **`kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md`** — DEFECT-1 section. ADR-0005's Context section cites this.
4. **`kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md`** §C.1 — the wrap-and-count diagnostic. ADR-0005's Context section cites this.
5. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/research.md`** §5 — the ADR plan summary (what each ADR action does and why).

### Why this is its own WP

- **Surface**: `.claude/adr/` is disjoint from `src/`, `test/`, `README.md`. Zero overlap with WP01/WP02/WP04/WP05's owned files.
- **Independence**: the ADR content doesn't depend on the code landing — the decision was already made in the plan phase. Writing the ADR now is documenting an already-made decision (DIRECTIVE_003), not waiting for code.
- **Reviewability**: ADR review is a markdown read, not a test run; keeping it separate avoids mixing code-review concerns with documentation-review concerns.

## Subtasks

### T012 — Edit `.claude/adr/0004-navigation-port.md` per supersession contract §1

**Purpose**: Mark ADR-0004 as superseded and explain why, while preserving its original body word-for-word.

**Steps**:

1. Open `.claude/adr/0004-navigation-port.md`.
2. Edit **only** the `**Status**:` line. Change:
   ```markdown
   **Status**: Accepted
   ```
   to:
   ```markdown
   **Status**: Superseded by ADR-0005 (2026-06-04)
   ```
   (Exact wording from `contracts/adr-supersession.md` §1.1.)
3. Append, at the **end** of the file (after the last existing section), the `## Supersession (2026-06-04)` section from `contracts/adr-supersession.md` §1.2 — verbatim. Include:
   - The `---` horizontal rule before the new section.
   - The "Why superseded" subsection citing `live-verification.2026-06-04.md` §C.1 (the wrap-and-count diagnostic showing two distinct `SpicetifyNavigation.subscribe` call stacks).
   - The "What this means for the navigation-port direction" subsection naming the deleted files and the C-007 rationale for retaining (not deleting) ADR-0004 itself.
4. **Do not** modify any other line of the file. Re-read the ADR end-to-end after the edit to confirm the Context / Decision / Consequences / Alternatives / Implementation notes sections are byte-identical to the pre-edit version (the diff should show only the status line change and the appended new section).

**Files**: `.claude/adr/0004-navigation-port.md`.

**Validation**:
- [ ] Status line reads exactly `**Status**: Superseded by ADR-0005 (2026-06-04)`.
- [ ] The appended section title is `## Supersession (2026-06-04)`.
- [ ] The appended section cites the live-verification artefact by path.
- [ ] Diff against the pre-edit file shows only the status line change + the appended section. No other line altered.
- [ ] File path unchanged (`0004-navigation-port.md`).

### T013 — Create `.claude/adr/0005-react-lifecycle-reset.md`

**Purpose**: Author the new ADR per `contracts/adr-supersession.md` §2.

**Steps**:

1. Create the file at `.claude/adr/0005-react-lifecycle-reset.md`.
2. Use the section structure from `contracts/adr-supersession.md` §2.1:
   - **Title**: `# ADR-0005: Reset on Mount + Unmount via React Lifecycle`
   - **Header lines**: `**Status**: Accepted`, `**Date**: 2026-06-04`, `**Mission**: dedup-navigation-reset-hotfix-01KT9NSW`, `**Supersedes**: ADR-0004 (link)`, `**Authors**: <your name or 'spec-kitty implementer'>` (the placeholder is OK if no human author is identified).
   - **Context**: quote / paraphrase the DEFECT-1 root cause from `mission-review.md` and reference the live-verification diagnostic at §C.1 (two `SpicetifyNavigation.subscribe` call stacks proving re-mount per navigation). Explain the structural blind spot in the prior test suite (`FakeNavigation` with `setPath` post-mount vs production mount-after-event).
   - **Decision**: show the `useEffect(() => { reset(); return () => reset(); }, [reset])` snippet. Explain belt-and-suspenders: mount-time reset = load-bearing under current production behavior; unmount cleanup = covers the hypothetical "stays mounted across navigation" regime. Cite R-1 idempotence at `playlists-store.test.ts:328-341`.
   - **Consequences**: Positive (no port indirection, no closure-stale-ref bugs, hexagonal architecture rules unchanged, mechanism independent of host navigation API). Negative (slight duplication — both branches reset; benign per R-1).
   - **Alternatives considered**: enumerate all four from the research and contract — (1) mount-only, (2) unmount-only, (3) port + listener with corrected heuristic, (4) inline into `app.tsx`. For each, one line on why rejected.
   - **Implementation notes**: file path, props interface narrowed, test seam removed, reference to the test contract.
3. Per `contracts/adr-supersession.md` §2.2, include filesystem-path references to:
   - `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md`
   - `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md`
   - `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/contracts/route-reset-provider.md`
   - `.claude/adr/0004-navigation-port.md`

**Files**: `.claude/adr/0005-react-lifecycle-reset.md` (new file).

**Validation**:
- [ ] All five header lines present (Status, Date, Mission, Supersedes, Authors).
- [ ] `Status: Accepted` (not `Proposed`).
- [ ] Context section references both the mission-review and live-verification artefacts by path.
- [ ] Decision section shows the exact `useEffect` snippet.
- [ ] All four alternatives considered are listed.
- [ ] Implementation notes reference `src/store/RouteResetContext.tsx` and the test contract.
- [ ] No code unrelated to the lifecycle approach in the Decision section (per §2.3).

### T014 — Verify per `contracts/adr-supersession.md` §3

**Purpose**: Confirm the supersession chain is internally consistent.

**Steps**:

1. Run:
   ```bash
   grep -l "Superseded by ADR-0005" .claude/adr/0004-navigation-port.md
   ```
   Expected: file path printed (exit 0). If not, T012's edit didn't land correctly.
2. Run:
   ```bash
   test -f .claude/adr/0005-react-lifecycle-reset.md
   ```
   Expected: exit 0.
3. Run:
   ```bash
   grep "Status.*Accepted" .claude/adr/0005-react-lifecycle-reset.md
   ```
   Expected: matches the status line. If `Proposed` or any other status appears, fix T013.
4. **Manual read pass**: open ADR-0004 and ADR-0005 in adjacent terminals. Read both end-to-end. Verify:
   - The reader can reconstruct why the original port direction was taken (ADR-0004 body).
   - The reader can reconstruct why it was reversed (ADR-0004 Supersession section + ADR-0005 Context).
   - The reader can reconstruct the new approach (ADR-0005 Decision + Consequences).
   - No internal contradictions (e.g. ADR-0005's Context shouldn't claim re-mount evidence that contradicts ADR-0004's Supersession section).

**Files**: none (verification only).

**Validation**:
- [ ] All three grep / test commands succeed.
- [ ] Manual read confirms internal consistency.
- [ ] Both files committed in this WP's commit.

## Definition of Done

- [ ] All three subtasks complete.
- [ ] ADR-0004's body is byte-identical to the pre-edit version except for the status line and the appended section.
- [ ] ADR-0005 exists with `Status: Accepted` and the required header + sections + references.
- [ ] The three verification commands in §3 of the contract all succeed.
- [ ] Reading both ADRs end-to-end yields a consistent decision history per DIRECTIVE_003.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Accidentally rewording ADR-0004's body (violates C-007) | Read the file fully *before* editing; then use surgical edits (status line replace + append). After the edit, diff against the pre-edit version and confirm only the two intended changes are present. |
| ADR-0005's Decision section drifts from the actual code being implemented in WP01 | Pull the `useEffect` snippet straight from `contracts/route-reset-provider.md` §1 — don't paraphrase. |
| Missing references to the diagnostic evidence | Use `contracts/adr-supersession.md` §2.2 as the checklist; all four references must appear. |
| ADR-0005 ships with `Status: Proposed` by accident | The contract mandates `Accepted`. The decision is made in the plan phase; the ADR is documenting it, not proposing it. |

## Reviewer Guidance

A reviewer of WP03 should:

1. Verify the ADR-0004 diff is **only** the status line + the appended section (no body changes).
2. Read ADR-0005 end-to-end and confirm every required section and reference is present.
3. Spot-check the diagnostic citations: `live-verification.2026-06-04.md` §C.1 should match what ADR-0005 claims about it.
4. Confirm the supersession chain links work — ADR-0004 mentions ADR-0005 and vice versa.

## When done

1. From inside the WP03 worktree: `spec-kitty agent action mark-done WP03 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`.
2. Trigger review per the project's mission flow.
