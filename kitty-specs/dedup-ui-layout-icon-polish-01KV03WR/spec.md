# Specification: Dedup UI Layout & Icon Polish

**Mission**: `dedup-ui-layout-icon-polish-01KV03WR`
**Type**: software-dev
**Target branch**: `main`
**Created**: 2026-06-13
**Status**: Draft

## Summary

A cosmetic-only revision of the in-client Dedup UI. Two presentation problems
are in scope, both visible in the reference screenshot
(`/home/alex/Pictures/Screenshot from 2026-06-13 10-04-39.png`):

1. **Sidebar icon.** The custom-app sidebar entry uses a placeholder glyph that
   neither reads as related to its function nor matches the visual style of the
   Spotify client's native sidebar icons. It should be replaced with a glyph
   that is stylistically consistent with the native sidebar icons (monochrome,
   `currentColor`, comparable line-weight and sizing) and whose motif is
   appropriate for a deduplication tool.

2. **Results layout.** After the user clicks **Dedup**, the results render in a
   narrow left-hand column. Per-collection and per-duplicate information is
   squished into a small width, forcing fields to wrap across many lines, while
   the large remaining horizontal area of the page sits empty. The existing
   content should instead make use of the available horizontal width and read
   on fewer lines.

The revision is **strictly presentational**. No collection, count, track field,
button, state, or behavior changes — only how the already-rendered content is
positioned, sized, and styled, plus the sidebar icon asset.

## User Scenarios & Testing

### Primary flow

**AS-1 — Recognizable, native-consistent sidebar icon.**
Given the Dedup custom app is installed,
when the user looks at the Spotify left sidebar,
then the Dedup entry's icon is visually consistent with the adjacent native
sidebar icons (monochrome line glyph rendered in `currentColor`, comparable
weight/sizing) and its motif is appropriate to a deduplication tool — not the
current placeholder glyph.

**AS-2 — Results use the horizontal width.**
Given a library that contains duplicates,
when the user clicks **Dedup** and the results render in a maximized desktop
window,
then the duplicate results occupy the page's available content width, each
collection's duplicate information reads on few lines rather than a tall
vertical stack, and there is no large empty horizontal band to the right of the
content.

**AS-3 — No content or behavior change.**
Given the revised UI,
when the user runs detection and removal exactly as before,
then every collection row, track count, track/artist field, Dedup button,
confirmation dialog, progress indicator, and outcome message appears with the
same identity and count as before the revision — only position and sizing
differ.

### Edge cases

- **Narrow window.** At reduced window widths the results remain readable and
  introduce no horizontal scrollbar; the layout degrades gracefully rather than
  overflowing.
- **Long names.** Long playlist or track names continue to be truncated
  (ellipsis) without breaking the layout or pushing siblings off-screen.
- **No duplicates.** The "no duplicates found" summary still renders correctly
  within the revised layout.
- **Many duplicate groups.** A collection with many duplicate groups remains
  scannable in the wider layout.
- **Active vs. default sidebar state.** The icon renders correctly in both the
  default and active (selected) sidebar states.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The Dedup sidebar entry SHALL display an icon that is stylistically consistent with the Spotify client's native sidebar icons (monochrome, `currentColor` fill, comparable line-weight and `viewBox` sizing) and whose motif is appropriate to a deduplication tool. | Draft |
| FR-002 | The sidebar icon SHALL render correctly in both the default and active (selected) sidebar states. | Draft |
| FR-003 | After Dedup results render, the results content SHALL occupy the available horizontal width of the page content area rather than a fixed narrow column. | Draft |
| FR-004 | Per-collection and per-duplicate information that currently wraps across multiple lines in the narrow column SHALL lay out on fewer lines when horizontal space is available. | Draft |
| FR-005 | The set of collections, track counts, track/artist fields, buttons, dialogs, progress indicators, and state views rendered SHALL be unchanged in identity and number — no field, control, or view is added, removed, or reworded by this revision. | Draft |
| FR-006 | All pre-existing detection, confirmation, removal, progress, and outcome behaviors SHALL function identically after the revision. | Draft |

### Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|----|-------------|-----------|--------|
| NFR-001 | The results content SHALL fill the available page content-area width. | At window widths ≥ 1024px, rendered results content occupies ≥ 90% of the available content-area width (no fixed cap below it). | Draft |
| NFR-002 | A single duplicate entry's primary fields SHALL render compactly. | At window widths ≥ 1024px, a duplicate entry's primary fields render on a single line rather than stacked across multiple lines. | Draft |
| NFR-003 | The results area SHALL not introduce horizontal overflow. | No horizontal scrollbar appears at window widths ≥ 768px. | Draft |
| NFR-004 | Test coverage SHALL remain at the charter-mandated level. | 100% line and 100% branch coverage maintained at the runner; all existing tests pass. | Draft |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The revision is cosmetic only: no change to rendered data, fields, counts, copy, or behavior. | Draft |
| C-002 | Changes are confined to the presentation layer (component styling / CSS modules and the sidebar icon asset). No domain, adapter, store, or port logic is modified. | Draft |
| C-003 | No new runtime dependency is introduced for the icon; it is delivered through the app's existing icon mechanism as an inline, native-style glyph. | Draft |
| C-004 | Existing architectural boundaries and tests (e.g. layer-import rules) remain green; no test is weakened to accommodate styling changes. | Draft |

## Success Criteria

- **SC-001**: A user viewing the sidebar sees a Dedup icon that visually matches
  the surrounding native icons and is no longer the placeholder glyph.
- **SC-002**: After running Dedup in a maximized window, the results content
  spans the page content width with no large empty horizontal band to the right
  (per NFR-001).
- **SC-003**: A duplicate entry's primary fields read on a single line at
  desktop widths instead of wrapping into a tall vertical stack (per NFR-002).
- **SC-004**: All previously passing tests still pass and coverage is unchanged
  at 100% line/branch — confirming no behavioral regression (per NFR-004).

## Key Entities

_Not applicable — no data model changes. This revision touches presentation
only._

## Assumptions

- "Match existing Spotify icon style" (user's discovery choice) means visual
  consistency with the native sidebar icons (monochrome line glyph in
  `currentColor` with comparable weight/sizing), combined with a motif that is
  appropriate to deduplication. Literal pixel-matching of any specific native
  icon is not required.
- The reference screenshot represents the current (pre-revision) state and a
  maximized desktop client window.
- "Use the horizontal space" means restructuring/sizing the already-rendered
  content to flow across the available width; it does **not** mean introducing
  new columns of data or additional track metadata (confirmed in discovery).

## Out of Scope

- Adding new track metadata, columns, or data fields.
- Changing detection, confirmation, or removal behavior.
- Reworking copy, labels, or collection ordering.
- Any change outside the presentation layer.
