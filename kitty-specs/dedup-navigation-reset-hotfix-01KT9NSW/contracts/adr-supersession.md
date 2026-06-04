# Contract: ADR-0004 Supersession + ADR-0005 Creation

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Files (CHANGE, owned by the impl WP)**: `.claude/adr/0004-navigation-port.md`
**Files (NEW, owned by the impl WP)**: `.claude/adr/0005-react-lifecycle-reset.md`

Supports: **FR-007** (ADR-0004 supersession), **FR-008** (ADR-0005 creation), **C-001** (ADR lifecycle), **C-007** (reversed-not-amended).

---

## 1. ADR-0004 supersession contract

The existing file `.claude/adr/0004-navigation-port.md` MUST be modified as follows:

### 1.1 Status header flip

Change line 3 from:

```markdown
**Status**: Accepted
```

to:

```markdown
**Status**: Superseded by ADR-0005 (2026-06-04)
```

### 1.2 Append a `## Supersession` section

After the final existing section and before the file's end, append:

```markdown
---

## Supersession (2026-06-04)

This ADR is **superseded by [ADR-0005: Reset on Mount + Unmount via React Lifecycle](./0005-react-lifecycle-reset.md)**.

### Why superseded

Live verification of the mission this ADR was authored for (`dedup-page-live-client-polish-01KT6ZCR`) on 2026-06-04 surfaced a critical defect: FR-008 (navigation-aware reset) does not work in the live client. The diagnostic captured in `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md` §C.1 showed two distinct `SpicetifyNavigation.subscribe` call stacks across one navigate-away/back cycle — proving the custom-app React tree DOES re-mount on each Dedup navigation.

This contradicts the §Alternatives.2 claim above ("the live probe (2026-06-04) … showed the custom-app component stays mounted across navigation. The cleanup never fires"). That claim was based on a T021 probe outcome captured in the WP-03 review note for the prior mission; **that probe outcome was incorrect**. The actual production behavior is re-mount-on-navigate, which makes the React lifecycle approach (`useEffect(() => { reset(); return () => reset(); }, [reset])`) correct and the navigation-port indirection unnecessary.

### What this means for the navigation-port direction

The port + adapter + contract test + this ADR are retired by the supersession. ADR-0005 documents the React-lifecycle approach that replaces them. The port + adapter files (`src/ports/navigation.ts`, `src/adapters/spicetify-navigation.ts`, etc.) are deleted in the same mission.

This file is retained (not deleted) per DIRECTIVE_003 and the supersession mission's C-007 ("reversed, not amended in place") — readers of the ADR history can reconstruct both the original direction and why it was reversed.
```

### 1.3 What MUST NOT change

- The body of the original ADR (Context, Decision, Consequences, Alternatives considered, Implementation notes) MUST remain word-for-word as merged in the prior mission. The supersession is a status change + an appended section; it is not a rewrite of the original content. (C-007.)
- The file path MUST remain `.claude/adr/0004-navigation-port.md`. Do not rename.

---

## 2. ADR-0005 creation contract

A new file `.claude/adr/0005-react-lifecycle-reset.md` MUST be created with the following structure:

### 2.1 Required sections

```markdown
# ADR-0005: Reset on Mount + Unmount via React Lifecycle

**Status**: Accepted
**Date**: 2026-06-04
**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Supersedes**: [ADR-0004: Navigation Port for In-Client Routing](./0004-navigation-port.md)
**Authors**: <author-list>

## Context

[Quote the diagnostic evidence:
 - mission-review.md DEFECT-1 root cause
 - live-verification.2026-06-04.md §C.1 wrap-and-count probe (two SpicetifyNavigation.subscribe stacks)
 - the structural blind spot in the prior test suite (mount-then-setPath vs production mount-after-event lifecycle)]

## Decision

Replace the navigation-port-based subscription with React lifecycle hooks:

```tsx
useEffect(() => {
  reset();              // mount: catch up — we just entered the dedup route,
                        // any prior loadState is stale by definition
  return () => reset(); // unmount: tear down to idle so the next mount lands clean
}, [reset]);
```

[Explain the "belt-and-suspenders" rationale: under the now-confirmed
production behavior (tree re-mounts on each navigation) the mount-time
reset is the load-bearing path; under the hypothetical alternative where
Spotify ever keeps the tree mounted across navigation, the unmount
cleanup becomes the load-bearing path. Both regimes are covered. R-1
idempotence (playlists-store.test.ts:328-341) guarantees the duplicate
calls cause no observable side effect.]

## Consequences

### Positive

- No port indirection; ~200 LOC of code + tests retired.
- No subscription-closure bugs class (the stale-`wasOnDedup`-at-mount issue that DEFECT-1 was an instance of).
- The hexagonal architecture rules in `test/architecture.test.ts` are unchanged — the lifecycle-only design respects every existing layer rule.
- The mechanism is independent of any host navigation API. If Spicetify ever changes `Platform.History.listen`'s signature (the source of the second-arg-shape concern in the prior mission review), this design is unaffected.

### Negative

- Slight duplication: `reset()` is called at both lifecycle boundaries. Benign because of R-1 idempotence, but worth noting for future readers who might wonder why the body isn't just one of the two.
- If the production custom-app behavior ever changes back to "stays mounted across navigation" (the ADR-0004 §Alternatives.2 hypothesis we now know was wrong), the mount-time reset becomes load-bearing for that regime. Still safe — the unmount cleanup never fires but is harmless.

## Alternatives considered

1. **Mount-only reset (drop the unmount cleanup)**: Simpler. Rejected because it locks the design to the current "re-mount on navigate" production behavior with no defense if Spotify ever changes.
2. **Unmount-only reset (drop the mount-time call)**: Cleaner-looking but loses the catch-up reset for the case where the React tree's prior state is stale (e.g. on first mount after a Spotify cold-start where the module-scope store has leftover state from a hot-reload). Rejected because the catch-up is the load-bearing path under the current production lifecycle.
3. **Restore the port + listener with a corrected `wasOnDedup` heuristic** (e.g. initialize `wasOnDedup = false` regardless of the actual current path, then let the first event correct it): Rejected — fragile heuristic that depends on assumptions about Spicetify's internal navigation timing we have no contract for. The lifecycle approach has no such dependency.
4. **Inline the effect into `src/app.tsx` and delete the provider component**: Rejected because it makes the production-lifecycle test harder (testing `App` requires stubbing Spicetify globals; the provider as a standalone component is a clean test target). See plan.md §research §1.

## Implementation notes

- File: `src/store/RouteResetContext.tsx` (renamed from `src/store/NavigationContext.tsx`).
- Props interface narrowed: `RouteResetProviderProps` has only `children`.
- The exported test seam `dedupPathPrefix()` is deleted (no consumer in the new design).
- See `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/contracts/route-reset-provider.md` for the test contract.
```

### 2.2 Required references

ADR-0005 MUST reference the diagnostic evidence by filesystem path:

- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md` (DEFECT-1)
- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md` (§C.1)
- `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/contracts/route-reset-provider.md` (test contract for the new provider)
- `.claude/adr/0004-navigation-port.md` (the superseded ADR)

### 2.3 What MUST NOT happen

- ADR-0005 MUST NOT be authored as an in-place edit to ADR-0004. C-007 forbids that. ADR-0004 retains its original content; ADR-0005 is a separate new file.
- ADR-0005's Decision section MUST NOT include code unrelated to the lifecycle approach. The single `useEffect` snippet is sufficient; no need to inline the whole provider.
- The `mission_id` reference in the ADR header MAY be either the slug (`dedup-navigation-reset-hotfix-01KT9NSW`) or the ULID; either is unambiguous.

---

## 3. Verification at mission DoD

A code reviewer or `spec-kitty-mission-review` agent verifies by:

1. `grep -l "Superseded by ADR-0005" .claude/adr/0004-navigation-port.md` — exits 0.
2. `test -f .claude/adr/0005-react-lifecycle-reset.md` — exits 0.
3. `grep "Status: Accepted" .claude/adr/0005-react-lifecycle-reset.md` — finds the line.
4. Reading both ADRs end-to-end confirms the supersession chain is internally consistent and the reasoning is reconstructable.
