---
work_package_id: WP01
title: Native sidebar library icon
dependencies: []
requirement_refs:
- FR-001
- FR-002
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-dedup-ui-layout-icon-polish-01KV03WR
base_commit: 01584a58c373d5d3484d7fc24812c3f09c14d1a7
created_at: '2026-06-13T09:38:59.280408+00:00'
subtasks:
- T001
- T002
- T003
- T004
shell_pid: "23297"
agent: "claude:opus-4-8:implementer:implementer"
history:
- 2026-06-13T09:28:03Z — created by /spec-kitty.tasks
authoritative_surface: src/css/
execution_mode: code_change
mission_slug: dedup-ui-layout-icon-polish-01KV03WR
owned_files:
- src/css/icon.svg
- .claude/adr/0015-native-library-sidebar-icon.md
priority: P1
tags: []
---

# WP01 — Native sidebar `library` icon

## Objective

Replace the placeholder Dedup sidebar glyph with the Spotify client's **native
`library` icon**, delivered through the *existing* inline-SVG mechanism (no new
dependency, no wiring change), so the Dedup entry is stylistically consistent
with the adjacent native sidebar icons and renders correctly in both default and
active/selected states.

**Satisfies**: FR-001 (native-consistent, dedup-appropriate icon), FR-002
(default + active states). Honors C-003 (no new runtime dependency).

## Context

- The custom-app icon is **not** referenced by a built-in name in this build
  pipeline. `node_modules/spicetify-creator/dist/buildCustomApp.js:17-23` reads
  `settings.icon` as a **file path** and inlines the file's *contents* into the
  manifest:
  ```js
  const iconPath = settings.icon ? path.join(inDirectory, settings.icon) : null;
  // ...
  icon: iconPath ? fs.readFileSync(iconPath, 'utf-8') : "",
  "active-icon": activeIconPath ? fs.readFileSync(activeIconPath, 'utf-8') : "",
  ```
- `src/settings.json` already points both `icon` and `activeIcon` at
  `"css/icon.svg"`. **Do not change `settings.json`.** The whole change is the
  *contents* of `src/css/icon.svg`.
- The current `src/css/icon.svg` is a `172×172` placeholder. The native icon set
  `Spicetify.SVGIcons` is a runtime `Record<Icon, string>` inside the live client
  (`"library"` is a member of the `Icon` union — see
  `src/types/spicetify.d.ts:47`, `:1938`). The string values **ship with the
  client**, not in `node_modules`, so the exact path data must be captured live.
- `Spicetify.SVGIcons` entries are the **inner** SVG markup (the `<path …>`
  content), typically authored against a `0 0 16 16` viewBox with
  `fill="currentColor"` so the sidebar recolors the default/active states for
  free.

Full rationale: `research.md §1`. Do not guess the path data — capture it
(DIRECTIVE_010 fidelity).

## Branch Strategy

- **Planning/base branch**: `main`.
- **Final merge target**: `main`.
- Execution worktrees are allocated **per computed lane** from `lanes.json`
  (written by `finalize-tasks`). Enter your lane's workspace; do not hand-edit
  branches.
- Implement command: `spec-kitty agent action implement WP01 --agent <name>`.

## Owned files (do not edit anything outside this list)

- `src/css/icon.svg` — the icon asset (replace contents).
- `.claude/adr/0015-native-library-sidebar-icon.md` — new ADR (gitignored path;
  create locally).

## Subtasks

### T001 — Capture the native `library` glyph markup

**Purpose**: Obtain the exact, current `library` path data and its native viewBox
from the running client so the shipped glyph is a faithful native match, not a
near-miss.

**Steps**:
1. With the Dedup app installed and the Spotify client running, open devtools
   (`Ctrl+Shift+I` if enabled via `spicetify enable-devtools`).
2. In the console run:
   ```js
   copy(Spicetify.SVGIcons["library"]);
   ```
   and also print it (`Spicetify.SVGIcons["library"]`) to read the value.
3. Note:
   - the **inner markup** (one or more `<path …>` elements), and
   - the **viewBox** the paths are authored for. Confirm from the value — it is
     typically `0 0 16 16`; **do not assume** the placeholder's `172×172`.

**Validation**:
- [ ] You have the literal inner markup string and the correct viewBox.

**Note (if you cannot reach a live client in your environment)**: capture is a
console one-liner that must run against the real client. If the implementing
session has no client access, hand the captured string to the live-verification
driver (T004) and record in the ADR that the path was pinned from the live value
at verification time — do **not** invent path data.

### T002 — Replace `src/css/icon.svg` with the native glyph

**Purpose**: Deliver the native icon through the existing file mechanism.

**Steps**:
1. Replace the **entire** contents of `src/css/icon.svg` with a complete element:
   ```svg
   <svg viewBox="0 0 16 16" fill="currentColor"><!-- captured library paths --></svg>
   ```
   using the viewBox confirmed in T001 and the captured inner markup.
2. Keep `fill="currentColor"` (drives FR-002 active/default recolor). Do **not**
   add hard-coded colors, width/height attributes that would break native
   sizing, or `<g>` wrappers with `fill="none"` placeholders left over from the
   old asset.
3. Leave `src/settings.json` untouched.

**Validation**:
- [ ] `src/css/icon.svg` contains only the native `library` markup wrapped in a
      single `<svg viewBox=… fill="currentColor">…</svg>`.
- [ ] No `width`/`height`/hard-coded color attributes that override native style.
- [ ] `src/settings.json` is unchanged (still `"css/icon.svg"` for both fields).

### T003 — ADR-0015: native-icon delivery decision `[P]`

**Purpose**: Record the load-bearing decision (DIRECTIVE_003 / charter Docs gate):
why the native icon is delivered by replacing the inline-SVG file contents rather
than referencing a built-in name or adding a dependency.

**Steps**:
1. Create `.claude/adr/0015-native-library-sidebar-icon.md` following the format
   of existing ADRs (e.g. `.claude/adr/0011-inline-platform-enrichment.md`):
   Status / Context / Decision / Consequences / Alternatives.
2. Capture: the build pipeline treats `settings.icon` as a **file path** (inlines
   contents), so a built-in *name* cannot be referenced; `currentColor` preserves
   active-state recolor; the path is pinned from the live `Spicetify.SVGIcons`
   value (fidelity, not guessed). Alternatives rejected: reference a name
   (pipeline mismatch); hand-draw a glyph (weight/sizing drift).

**Validation**:
- [ ] `.claude/adr/0015-native-library-sidebar-icon.md` exists with the standard
      ADR sections and references FR-001/FR-002/C-003.

### T004 — Live-verify the sidebar icon

**Purpose**: This icon change is visual; the binding acceptance evidence is the
live-verification checklist (`quickstart.md`), which MUST be driven before this
WP reaches `done`.

**Steps**:
1. Build/iterate per `quickstart.md` (`npm run watch`; `spicetify watch -a -l`,
   or `spicetify apply`).
2. Drive the **Sidebar icon (AS-1, AS-2)** section of the `quickstart.md`
   live-verification checklist:
   - [ ] The Dedup entry shows the native `library` glyph (monochrome,
         `currentColor`, native weight/sizing) — no longer the placeholder.
   - [ ] Correct in **default** and **active/selected** states.
3. Confirm the gates are unaffected (no TS changed):
   - [ ] `npm run typecheck` passes.
   - [ ] `npm run test:coverage` passes (100% line/branch — unchanged, this WP
         adds no TS lines/branches).

**Validation**:
- [ ] Both sidebar checklist items confirmed in the live client.
- [ ] typecheck + coverage green.

## Definition of Done

- `src/css/icon.svg` holds the native `library` markup (`currentColor`, native
  viewBox); `settings.json` untouched.
- ADR-0015 written.
- Live-verification sidebar checklist driven and passing in **both** states (this
  is mandatory — do not mark `done` on the strength of the unit suite alone).
- `npm run typecheck` and `npm run test:coverage` green.
- No file outside `owned_files` modified.

## Reviewer guidance

- Confirm `settings.json` was **not** changed (the icon must be delivered by the
  file-contents swap).
- Confirm `fill="currentColor"` is preserved and no hard-coded color/size leaks in.
- Confirm the live-verification artifact was actually driven (both default and
  active states) — per this repo's standing rule, a skipped live verification is a
  blocking defect.
- Confirm the path data was captured from the live client, not invented.

## Activity Log

- 2026-06-13T09:38:59Z – claude:opus-4-8:implementer:implementer – shell_pid=23297 – Assigned agent via action command
