# Research: Dedup UI Layout & Icon Polish

Phase 0 research for `dedup-ui-layout-icon-polish-01KV03WR`. Each item ends with
a **Decision / Rationale / Alternatives** block.

---

## §1. Native sidebar icon — delivery mechanism & capture

**Question**: How does the chosen native `library` glyph actually reach the
Spicetify sidebar entry, and how do we obtain its exact markup?

**Findings (verified against `node_modules/spicetify-creator/dist`)**:

- The custom-app icon is **not** referenced by a built-in name in this build
  pipeline. `buildCustomApp.js` reads `settings.icon` as a **file path** and
  inlines the file's *contents* into the manifest:
  ```js
  // node_modules/spicetify-creator/dist/buildCustomApp.js:17-23
  const iconPath = settings.icon ? path.join(inDirectory, settings.icon) : null;
  const activeIconPath = settings.activeIcon ? path.join(inDirectory, settings.activeIcon) : iconPath;
  // ...
  icon: iconPath ? fs.readFileSync(iconPath, 'utf-8') : "",
  "active-icon": activeIconPath ? fs.readFileSync(activeIconPath, 'utf-8') : "",
  ```
  `src/settings.json` currently sets both `icon` and `activeIcon` to
  `"css/icon.svg"`. So the way to adopt the native glyph **without** touching the
  wiring or adding a dependency (C-003) is to **replace the contents of
  `src/css/icon.svg`** with the native `library` SVG markup.

- The built-in icon set is `Spicetify.SVGIcons` — a runtime
  `Record<Icon, string>` inside the live Spotify client (declared in
  `src/types/spicetify.d.ts:1938`; `"library"` is a member of the `Icon` union at
  `:47`). The string values are **not** bundled in `node_modules` (they ship with
  the client), so the exact path data must be captured from the running client.
- `Spicetify.SVGIcons` entries are the **inner** SVG markup (the `<path …>`
  content), typically authored against a `0 0 16 16` viewBox and using
  `fill="currentColor"` so the sidebar can recolor the default/active states.

**Capture procedure (for implementation)**:
1. In the Spotify client devtools console: `copy(Spicetify.SVGIcons["library"])`.
2. Wrap it in a complete element with the matching viewBox and `currentColor`,
   e.g. `<svg viewBox="0 0 16 16" fill="currentColor">…captured paths…</svg>`,
   matching the viewBox the captured paths are authored for (confirm via the
   console value — do **not** assume 172×172 like the current placeholder).
3. Write that into `src/css/icon.svg`.

> Fidelity note (DIRECTIVE_010): the exact path string is pinned from the live
> `Spicetify.SVGIcons.library` value at implementation time — it is **not**
> guessed here, to avoid shipping a near-miss glyph. The rendered result is
> confirmed by the live-verification step (AS-1/AS-2).

**Decision**: Replace `src/css/icon.svg` contents with the native `library`
glyph captured from `Spicetify.SVGIcons.library`, preserving `currentColor` and
the glyph's native viewBox. Leave `src/settings.json` unchanged.
**Rationale**: Reuses the existing inline-SVG mechanism (no new dependency,
C-003); `currentColor` makes the active/default states (FR-002) work for free;
native markup guarantees style consistency (FR-001) by construction.
**Alternatives considered**: (a) Reference a built-in name in `settings.json` —
rejected: the build pipeline treats the field as a file path, not an icon name.
(b) Hand-draw a new glyph — rejected: the user chose the native `library` icon,
and hand-drawing risks weight/sizing drift from the native set.

---

## §2. happy-dom does not compute layout → NFRs are live-verified

**Question**: Can the NFR thresholds (≥90% content width, single-line fields, no
horizontal scrollbar at given breakpoints) be asserted in the Vitest/happy-dom
unit suite, given the charter's 100% coverage + boundary-testing mandate?

**Findings**:
- happy-dom implements the DOM API but **does not perform CSS layout**: it does
  not resolve CSS-module/SCSS rules into computed geometry, has no real viewport,
  and returns zeros/stubs for `getBoundingClientRect`, `offsetWidth`, and
  resolved `getComputedStyle` layout values. CSS Modules are imported as opaque
  class-name maps in tests, not applied stylesheets.
- Therefore "occupies ≥90% width", "renders on a single line", and "no horizontal
  scrollbar" (NFR-001/002/003) are **not** observable in this unit environment.

**Decision**: Unit tests assert the **structural** change only — that each row,
in each detection state (`loaded`/`scanning`/`failed`), renders the detection
child inside the full-width **spanning wrapper** (by role/testid/class), and that
existing content (counts, fields, buttons, dialog copy) is unchanged (FR-005).
The visual NFR thresholds are bound to the **live-verification artifact** in
`quickstart.md` and driven during implement-review before the WP can reach
`done`.
**Rationale**: Keeps 100% line/branch coverage honest (every changed JS line is
exercised) without writing assertions the environment cannot satisfy; respects
the repo's standing rule that DoD live-verification must be driven, not skipped.
**Alternatives considered**: (a) Add jsdom/Playwright pixel tests — rejected:
out of scope for a cosmetic mission and not part of the configured runner; would
add a dependency/infra the charter doesn't sanction here. (b) Assert inline
style numbers — rejected: the values live in SCSS modules, not inline styles.

---

## §3. Grid-cramming root cause (the verticality)

**Question**: Why do the per-row results render as a tall, squished vertical
stack in a narrow band?

**Findings**: Both `PlaylistRow` and `LikedSongsRow` render their `<li>` as
`display: grid; grid-template-columns: 48px 1fr auto auto` (4 columns):
cover/heart · text · count · `DedupButton`. The conditional detection children —
`ScanningView`, `DetectionLoadedSummary` (which itself hosts the Remove button,
confirm dialog, progress, and outcome), and `DetectionFailedView` — are appended
as the **5th** grid child. With only 4 explicit columns, the 5th item flows into
an **implicit row's first (48px) column**, so all that content is squeezed into a
48px-wide box and wraps line-by-line (the "very vertical" green Remove button,
the squished summary, etc.). Separately, the whole list is capped at
`max-width: 900px` (`LoadedView.module.scss .list`), leaving the empty right
band on wide windows.

**Decision**: Fix at the row level by wrapping the conditional detection children
in a single element given `grid-column: 1 / -1` (spans all columns), and remove
the 900px list cap. This is the smallest change that addresses every affected
surface at once.
**Rationale**: Targets the actual cause (column placement + width cap) rather
than patching each child's CSS; one wrapper covers loaded/scanning/failed
uniformly.
**Alternatives considered**: Apply `grid-column: 1/-1` to each child's own root
class — rejected: those roots belong to other components' CSS modules (SRP
violation for the row to reach into them); the wrapper keeps placement the row's
own responsibility.

---

## §4. Width strategy for the list

**Question**: Remove the cap entirely, or raise it?

**Findings**: NFR-001 requires results to occupy ≥90% of the content-area width
at ≥1024px with "no fixed cap below it". The page wrapper (`DedupPage.module.scss
.page`) already provides `padding-inline: 24px` and the scroll surface, so the
list can simply fill its container.

**Decision**: Set the list to fill its container width (`max-width: none`;
`width: 100%` as needed) so it tracks the content area at any size; rely on the
page wrapper's existing inline padding for gutters. Long names keep their
existing `text-overflow: ellipsis` truncation; narrow windows stay readable with
no horizontal scrollbar (NFR-003) because the grid's `1fr`/`auto` columns and
`min-width: 0` text column already shrink gracefully.
**Rationale**: Satisfies NFR-001 directly and avoids encoding an arbitrary
breakpoint cap.
**Alternatives considered**: A high fixed cap (e.g. 1600px) — rejected: still a
"fixed cap" the NFR discourages and would reintroduce an empty band on very wide
windows.

---

## Open items

None. All planning unknowns are resolved; the only deferred concrete value is the
exact `library` path string, which is captured from the live client during
implementation per §1 (a procedure, not an unknown).
