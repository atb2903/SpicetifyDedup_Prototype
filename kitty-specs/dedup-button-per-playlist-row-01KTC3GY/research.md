# Phase 0 Research — Dedup Button Per Playlist Row

**Mission**: `dedup-button-per-playlist-row-01KTC3GY`
**Date**: 2026-06-05
**Status**: Resolved (user confirmed Reading B at §7 on 2026-06-05; all load-bearing decisions locked)

This file records the load-bearing decisions behind the upcoming plan. It assumes the reader knows the spec (`kitty-specs/dedup-button-per-playlist-row-01KTC3GY/spec.md`), the hexagonal layout established by ADR-0001 (`.claude/adr/0001-hexagonal-load-dedupable-playlists.md`), and the existing row components (`src/ui/PlaylistRow.tsx`, `src/ui/LikedSongsRow.tsx`).

---

## Decision 1 — Element type: native `<button type="button">`

**Decision**: Render the Dedup affordance as a native HTML `<button>` with an explicit `type="button"` (no enclosing `<form>`, so this only protects against future surrounding markup). No `<div role="button">`, no `<a>`, no abstraction over the `Spicetify.ReactComponent` family.

**Rationale**:

1. NFR-001 (keyboard reachability) and NFR-002 (accessible name) are both satisfied for free by a native `<button>`: it is tab-focusable, activates on Enter and Space without an explicit `onKeyDown` handler in real browsers, and its accessible name is computed from `aria-label` or text content per the ARIA spec.
2. Spec §C-002 forbids new runtime deps. A native button needs zero additional packages. `Spicetify.ReactComponent.ButtonPrimary` is themed by the host but cannot be relied on inside Vitest's happy-dom environment (the global is stubbed in tests; using it would force every row-render test to set up a `vi.stubGlobal('Spicetify', …)` even though the component is purely presentational).
3. ADR-0001's import rules forbid `src/ui/` from reaching into `src/adapters/` or `src/ports/`. A native button has no host dependency, so the boundary stays clean. A `Spicetify.ReactComponent.*` button would put a host reference directly inside a UI file, which is permitted by the import rules but would surface drift the next time Spotify reshapes its component library (per `.claude/spicetify-ecosystem-research.md`'s "Defensive patterns to adopt from day one").
4. The button is functionally trivial in this mission (one console-log side effect). Investing in a themed Spicetify component before the click handler has any real behavior is premature.

**Alternatives considered**:

- **`Spicetify.ReactComponent.ButtonTertiary`** (the host's small-button family). Rejected for this iteration per #2/#3 above; the next mission that adds real behavior can re-evaluate and migrate via a one-file CSS-module + element swap if visual consistency with the rest of the client becomes a real complaint.
- **`<div role="button" tabIndex={0}>` with `onKeyDown` handlers**. Rejected because it manually reconstructs every accessibility behavior the native button already supplies and is uniformly worse for screen readers (per WAI-ARIA Authoring Practices §3.5: prefer native semantics).
- **Icon-only button** (e.g. a "remove-duplicate" glyph). Rejected for this iteration: NFR-002 requires the accessible name to include "Dedup" AND the playlist name; a text label is the simplest way to satisfy that, and the icon decision can come with a future polish mission.

**Test consequence**: tests query the button via `getByRole('button', { name: /Dedup <name>/ })`, exercising the same accessibility-tree query a screen reader would use. See §3 for the exact accessible-name format.

---

## Decision 2 — Click-log surface: a single-purpose helper file under `src/ui/`

**Decision**: Extract the `console.log` call into its own file at `src/ui/dedup-click-log.ts`, exporting a pure named function `logDedupClick(name: string, uri: string): void`. The button component calls it from its `onClick` handler. The helper takes the literal `name` and `uri` as positional string arguments — it does NOT take a `CollectionViewModel`, an event object, or anything richer.

**Rationale**:

1. **SRP (`C-003`)**: the button knows about React, props, and DOM events. The log call is a console side effect. Keeping them in separate files lets each be unit-tested with the simplest possible setup — the helper as a 3-line plain-TS test asserting `console.log` was called with the expected string; the button as a presentational React test asserting the `onClick` is wired to the helper. Inlining the helper in the button file makes both tests load React and the helper's argument shape becomes implicit.
2. **Locality of behavior**: the helper is the seam where the next mission (real dedup) will eventually replace `console.log` with a confirmation flow. Owning that seam in its own file makes the replacement a single-file diff with a clear rename / refactor signature, instead of a multi-line patch inside an unrelated component.
3. **Charter `DIRECTIVE_001` (architectural integrity)**: `src/ui/` is the right layer. The helper is presentation-adjacent (`console.log` is a UI affordance of the dev console, not domain logic; not a host API surface either). It must NOT live under `src/domain/` because the architecture test forbids domain files from emitting side effects in production code paths (and `console.log` is a side effect), and because the rule against React/Zustand/Spicetify imports does not apply to `console`, but the *intent* of the domain layer is purity. It must NOT live under `src/ports/` (no contract exists between the click and an adapter) or `src/adapters/` (no host call). `src/ui/` is the only correct home.
4. **Test ergonomics**: the helper has one input pair → one output. Coverage is 100% with one test. `vi.spyOn(console, 'log')` + restore in `afterEach` is the standard pattern (Vitest documents it at https://vitest.dev/api/vi.html#vi-spyon).

**Alternatives considered**:

- **Inline the `console.log` call inside the button's `onClick`**. Smallest end-state surface. Rejected because (a) the future-mission diff becomes harder to read, (b) testing the format string forces rendering the button rather than calling a pure function, and (c) it concentrates two concerns in one file.
- **Put the helper in `src/domain/`**. Rejected per #3 above.
- **Wrap `console.log` in a project-wide logger abstraction**. Over-engineering. Rejected: the only consumer is one button in one mission, and the next mission replaces the call entirely. A logger abstraction earns its keep when there are 3+ call sites or when log destination needs to vary; neither is true here.

---

## Decision 3 — Wiring shape: the button receives `name` and `uri` as separate string props

**Decision**: New file `src/ui/DedupButton.tsx` exports a component with the prop interface

```ts
export type DedupButtonProps = {
  playlistName: string;
  playlistUri: string;
};
```

The component renders a `<button type="button" aria-label={`Dedup ${playlistName}`} onClick={() => logDedupClick(playlistName, playlistUri)}>Dedup</button>` (modulo styling and exact JSX). `PlaylistRow` constructs the button as `<DedupButton playlistName={row.displayName} playlistUri={row.key} />` at the trailing edge of its grid. `LikedSongsRow` does the same with `playlistName="Liked Songs"` and `playlistUri="spotify:collection:tracks"` — see §7 for the URI sourcing.

**Accessible-name format**: `Dedup {playlistName}` (e.g. `Dedup My Playlist`, `Dedup Liked Songs`). The spec's NFR-002 example uses `Dedup playlist <name>` but that wording reads awkwardly for Liked Songs (`Dedup playlist Liked Songs`); NFR-002's *normative* text is "includes the word 'Dedup' and the playlist name", which `Dedup <name>` satisfies literally. Both row variants use the same format so the accessibility query (`getByRole('button', { name: /Dedup <name>/ })`) is uniform across tests.

**Rationale**:

1. **Decoupling**: `DedupButton`'s test surface does not depend on `CollectionViewModel`'s shape. If `CollectionViewModel` adds a field next mission, `DedupButton`'s tests don't change. This matches the existing pattern of small presentational components in `src/ui/` (e.g. `LikedSongsRow` reads only `trackCount` off the view model even though it accepts the full type — but `DedupButton` doesn't accept the type at all because it does not need to).
2. **`row.key` is the canonical URI**: in `src/domain/view-models.ts:115`, `key` is set to `c.uri` for playlist rows. `key` is already string-typed and stable. Using `row.key` rather than threading a separate `uri` field through `CollectionViewModel` avoids broadening the view-model type.
3. **String-only inputs**: every prop is a primitive. Component identity for memoization, if ever needed, is shallow-equal-stable without `useMemo`.
4. **Aligns with spec FR-002**: each rendered button binds at render time to exactly one (name, uri) pair captured by closure. React's reconciliation cannot mix them up because each row's JSX subtree is independently rendered with its own props — no shared mutable state, no list-index lookup at click time.

**Alternatives considered**:

- **Pass `row: CollectionViewModel`** (mirroring `PlaylistRow`'s and `LikedSongsRow`'s prop shape). Rejected because the button reads only two strings; passing the whole view model couples the button's tests to the view-model type and forces the test fixture to construct irrelevant fields.
- **Pass a single `playlist: { name: string; uri: string }` object**. Rejected because (a) flat string props are simpler to fixture in tests, and (b) it introduces a third type (`Playlist`) that doesn't earn its keep at one call site.
- **Pass an `onClick: () => void` from `PlaylistRow`** (push the side effect entirely up). Rejected because `PlaylistRow` would then have to know about `logDedupClick`, which inverts the layering — the click-log helper is the button's concern, not the row's.

---

## Decision 4 — Row layout: extend the existing 3-column grid to 4 columns

**Decision**: `src/ui/PlaylistRow.module.scss` changes its `grid-template-columns` from `48px 1fr auto` to `48px 1fr auto auto`, with the button rendered as the fourth grid cell. The `gap: 12px` is retained. The button cell is right-aligned by the grid's `auto` sizing. No new wrapper element is added; the button is a direct child of the `.row` `<li>`.

**Rationale**:

1. **Minimal diff to the existing styling**: the grid already places the trackcount in column 3 via `auto`. Column 4 takes the same sizing behavior and inherits the row's vertical centering (`align-items: center`).
2. **NFR-003 (layout non-regression)**: the name (column 2 with `1fr`) keeps absorbing all extra horizontal space; the count and button (auto-sized columns 3 and 4) sit at the trailing edge. The existing `text-overflow: ellipsis` rule on `.name` still handles long names. The 5-row test fixture mentioned in the spec stays valid.
3. **Single point of layout knowledge**: row layout lives in one CSS module. Adding the button as a sibling cell (not a child of `.text` and not a child of `.count`) is the most discoverable structure for a future contributor reading the SCSS.
4. **No additional column for the Liked Songs row** (see §7 — pending decision on whether `LikedSongsRow` gets a button). If §7 lands as "Liked Songs row also gets a button", `LikedSongsRow.module.scss` mirrors this change; if it lands as "no button on Liked Songs", `LikedSongsRow.module.scss` is unchanged and the grid columns stay 3.

**Alternatives considered**:

- **Wrap count + button in a single `<div>` with `display: flex; gap: 8px;`**. Equivalent visually. Rejected because it adds an extra DOM node per row purely for grouping; the grid handles spacing without it.
- **Render the button outside the row's grid via absolute positioning**. Rejected — absolute positioning out of the grid breaks the row's responsive behavior at narrow widths and makes vertical centering depend on the row's exact height.
- **Reorder columns** (button before trackcount). Rejected: trackcount → button matches the spec phrase "trailing edge" semantically, and matches the visual convention of action buttons being the rightmost element in a row.

---

## Decision 5 — Test harness: `fireEvent` from `@testing-library/react`, no new test dep

**Decision**: Tests use `fireEvent.click(button)` for click activation. For the keyboard activation cases (spec SC-003: Enter or Space on a focused button), tests use `fireEvent.keyDown(button, { key: 'Enter' })` and `fireEvent.keyDown(button, { key: ' ' })`. The `DedupButton` does NOT attach an explicit `onKeyDown` handler — instead, the test relies on the native browser semantic (which happy-dom implements for `<button>` elements: Enter and Space synthesize a `click` event when the button has focus).

**Open caveat**: this needs a one-line *failing* test against the current code to confirm happy-dom 20.9's button-key-to-click synthesis. If happy-dom does NOT synthesize the click event from keydown for native buttons, the alternatives are (a) add an explicit `onKeyDown` to the button that calls the same handler — but this is brittle and adds a second activation path tests must cover, or (b) add `@testing-library/user-event` (~70 KB minified gzipped, devDependency only — does not violate C-002 which is about runtime deps) and use `userEvent.keyboard('{Enter}')`/`userEvent.keyboard(' ')`. Plan-phase verifies happy-dom's behavior with a one-line RED-then-GREEN probe; if probe fails, switch to (b).

**Rationale**:

1. The repo currently has zero `@testing-library/user-event` imports (`grep -rn "userEvent" test/` returns no results). All existing component tests use `render` + `screen` + `fireEvent`. Following the existing pattern keeps test infrastructure consistent and avoids reviewing a new package against the charter.
2. `fireEvent` is already imported indirectly via `@testing-library/react` (which re-exports it). No `package.json` change required.
3. Native `<button>` semantics for Enter and Space activation are part of the HTML5 spec and are implemented by every real browser. The question is only whether happy-dom synthesizes them; the probe answers it quickly.
4. For tab order (NFR-001), tests use `button.focus()` + `expect(document.activeElement).toBe(button)` rather than `userEvent.tab()` — simpler and equivalent for a single-button focus check.

**Alternatives considered**:

- **Add `@testing-library/user-event` upfront**. Lower friction for keyboard tests. Rejected as the default because adding a dep before the probe answers whether it's needed is premature; if the probe shows happy-dom does the right thing, the dep is dead weight.
- **Use `fireEvent.click` only and skip keyboard tests**. Rejected outright: SC-003 explicitly mandates keyboard activation coverage.
- **Implement an explicit `onKeyDown` on the button**. Rejected because it forks the activation path (click handler + keydown handler) and tests must then cover both, doubling the assertion surface for the same semantic.

---

## Decision 6 — ADR scope and slug

**Decision**: One new ADR at `.claude/adr/0006-console-only-dedup-click-confirmation.md`, scope: the temporary diagnostic-console confirmation mechanism, explicitly framed as the placeholder that the next mission replaces. The ADR cross-links to the spec (C-007 mandates it) and is short — one decision, one rationale paragraph, one "alternatives considered" paragraph, one "consequences" paragraph noting the replacement plan.

**Rationale**:

1. C-007 requires an ADR for the console-only diagnostic choice. The slug `0006-console-only-dedup-click-confirmation.md` continues the sequence (existing ADRs run `0001`–`0005`).
2. The decision is load-bearing per charter `DIRECTIVE_003` (decision documentation): a future contributor reading `DedupButton.tsx` should be able to follow the ADR pointer and understand *why* the button has no UI feedback today. Without the ADR, "this looks like an oversight" is a plausible mis-read.
3. The ADR is not for the button's *existence* (the spec covers that) nor for the element-type / module-layout choices (`DIRECTIVE_001` says the chosen architectural pattern is the load-bearing decision; the patterns chosen here are routine extensions of ADR-0001's hexagonal layout, not new patterns). The ADR is *only* for the temporary diagnostic.

**Alternatives considered**:

- **No ADR, just a JSDoc on the helper**. Rejected — C-007 mandates an ADR.
- **One ADR per Decision 1–5**. Rejected — Decisions 1, 2, 3, 4, 5 are routine applications of existing patterns; they don't establish new precedent the way "use hexagonal" or "use Zustand" did. The charter calls for ADRs at the load-bearing-decision granularity, not the per-component-choice granularity.

---

## §7 Decision — Liked Songs row also gets a Dedup button (Reading B)

**Decision**: Both `<PlaylistRow>` and `<LikedSongsRow>` render a `<DedupButton>`. User confirmed Reading B on 2026-06-05.

**Resolved sub-decisions**:

### §7.1 — `playlistUri` for Liked Songs: `spotify:collection:tracks`

The synthetic Liked Songs row carries `key: 'liked-songs'` in `CollectionViewModel` (`src/domain/view-models.ts:107`), which is a stable React reconciliation key — *not* a Spotify URI. For the button's `playlistUri` prop, we use the canonical Spotify URI form for the saved-tracks collection: `spotify:collection:tracks`. This is the URI string the modern Spotify desktop client uses internally for the Liked Songs collection (visible in the client's address-bar navigation and in `Spicetify.Platform.History.location` when the user is viewing Liked Songs).

`LikedSongsRow.tsx` hardcodes the URI literal at the call site — it is not threaded through `CollectionViewModel`:

```tsx
<DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />
```

Rationale for hardcoding:
- `LikedSongsRow` already hardcodes the display name (`"Liked Songs"`) and the owner label (`"Your Library"`) at `src/ui/LikedSongsRow.tsx:52-53`. The URI literal fits the same pattern.
- `CollectionViewModel.key` exists to be a React reconciliation key; broadening it to carry a Spotify URI would couple two unrelated concerns (list keying and content identity).
- Adding a new field to `CollectionViewModel` (e.g. `canonicalUri: string`) would propagate through the view-model transform, the FakePlaylistsLoader fixtures, the contract tests, and every existing UI test — a wide blast radius for a one-call-site value.

**Verification note**: this is a UI-only string. The next mission (real dedup) will need to confirm the URI form `Spicetify.Platform.LibraryAPI` and the GraphQL persisted queries actually accept; this iteration emits the literal to the dev console without calling any host API, so the value is safe regardless. The deferred-implementation list at §8 carries this for the future mission.

### §7.2 — Accessible-name format: `Dedup {name}` (uniform)

Both row variants use the same `aria-label={`Dedup ${playlistName}`}` format. For Liked Songs this produces `Dedup Liked Songs` — natural-reading. NFR-002 in the spec says the accessible name must "include the word 'Dedup' and the playlist name" — `Dedup Liked Songs` satisfies that literally. The spec's parenthetical example `aria-label="Dedup playlist <name>"` is illustrative (the spec uses `e.g.`); we are not bound to the literal "playlist" word, only to the substantive rule. See Decision 3's "Accessible-name format" subsection.

### §7.3 — Layout change for `LikedSongsRow`

`src/ui/LikedSongsRow.module.scss` mirrors Decision 4's grid extension: `grid-template-columns: 48px 1fr auto` → `48px 1fr auto auto`. No other changes to the file.

### §7.4 — Existing tests carry-over

The existing 1001-row scale test in `test/ui/LoadedView.test.tsx:152-169` (Liked Songs + 1000 playlists) becomes a 1001-button render. Add an assertion that the rendered button count equals 1001 (one per row, including the Liked Songs row) under Reading B. The existing test does not assert button absence so it stays valid; the new assertion is additive.

---

## §8 — Deferred to implementation (not clarifications)

These are discoveries that may surface during TDD; they don't block the plan.

### happy-dom button-key-to-click synthesis

Verified or refuted by a one-line probe in the first WP. If happy-dom does the right thing, Decision 5 stands. If not, plan adds `@testing-library/user-event` as a devDependency in the first WP.

### Exact text vs aria-label split — resolved as option 1

NFR-002 requires the accessible name include "Dedup" + the playlist name. Two implementations satisfy this:
- **Chosen** — `<button aria-label="Dedup {name}">Dedup</button>` (visible text "Dedup" is constant across rows; accessible name includes the playlist name).
- Rejected — `<button>Dedup {name}</button>` (visible text includes the playlist name and would visually wrap inside narrow buttons; also produces long action labels per row).

The chosen form keeps the visible button text constant (`Dedup`) and uniform across `<PlaylistRow>` and `<LikedSongsRow>`, while the screen-reader-visible accessible name disambiguates per row.

### Canonical URI verification for Liked Songs

§7.1 commits to `spotify:collection:tracks` as the URI literal for the Liked Songs button's `playlistUri` prop. This iteration only logs the string to the dev console — no host call is made with it — so the literal is safe regardless of whether `Spicetify.Platform.LibraryAPI` ultimately accepts that exact form. The next mission (real dedup) will need to verify against `Spicetify.Platform.LibraryAPI` and the relevant GraphQL persisted queries when wiring the click to actual saved-tracks mutation; that verification is out of scope here but is flagged for that mission's research.

### CSS-module sibling for the button

`DedupButton.tsx` may or may not ship its own CSS module. If the styling is two rules (padding + a subtle hover treatment), the button can use a `style={…}` literal or borrow `--dedup-button-*` tokens directly via a className the `PlaylistRow.module.scss` declares. If the button grows a focus-ring style and a disabled treatment, a dedicated `DedupButton.module.scss` is cleaner. Decide during the WP based on rule count.

---

## §9 — Source pointers

- Spec: `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/spec.md`.
- ADR-0001 (hexagonal): `.claude/adr/0001-hexagonal-load-dedupable-playlists.md`.
- Existing row: `src/ui/PlaylistRow.tsx`, `src/ui/PlaylistRow.module.scss`.
- Existing Liked Songs row: `src/ui/LikedSongsRow.tsx`, `src/ui/LikedSongsRow.module.scss`.
- View-model contract: `src/domain/view-models.ts` (specifically `CollectionViewModel` at L80–87 and `toViewModels` at L102–123).
- Architecture import test: `test/architecture.test.ts` (rules table at L34–75).
- Test setup: `test/setup.ts`, `vitest.config.ts` (coverage thresholds at L19–25).
- Style tokens: `src/styles/_tokens.module.scss` (`--dedup-button`, `--dedup-button-hover`, `--dedup-button-disabled`).
- HTML living standard, button activation: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission (Enter on focused button); https://html.spec.whatwg.org/multipage/interaction.html#the-tabindex-attribute (default focus order).
- WAI-ARIA Authoring Practices, button pattern: https://www.w3.org/WAI/ARIA/apg/patterns/button/.
- Testing Library: `fireEvent` docs at https://testing-library.com/docs/dom-testing-library/api-events; `getByRole` accessibility query at https://testing-library.com/docs/queries/byrole.
- Vitest `vi.spyOn` for `console.log`: https://vitest.dev/api/vi.html#vi-spyon.
