# Specification: Dedup Button Per Playlist Row

**Mission**: `dedup-button-per-playlist-row-01KTC3GY`
**Mission ID**: `01KTC3GY1VM87DPV0SEDQS24NE`
**Mission Type**: software-dev
**Target branch**: `main`
**Created**: 2026-06-05

## Overview

The Dedup custom app's library page already loads and renders a list of playlists from the user's library. This mission adds a per-row "Dedup" action button at the trailing edge of each playlist row. The button is **wired but not functional**: clicking it only writes a diagnostic line to the developer console identifying which playlist row was clicked. Real deduplication logic is explicitly out of scope and lands in a later mission.

The point of this mission is to prove that React event wiring identifies the correct playlist per row — no stale closures, no row-index mix-ups, no off-by-one mistakes — *before* a future mission attaches destructive library mutation behind the same click handler.

## Purpose & Motivation

- **Surface scaffolding**: provide the UI affordance (one button per playlist row) that subsequent missions will attach real dedup behaviour to.
- **Wiring proof**: verify that the click handler receives the exact `(name, uri)` pair belonging to the clicked row, even when names collide or rows reorder.
- **Risk containment**: per charter, "no silent library mutations". This mission deliberately ships a no-op handler so the wiring can be reviewed and trusted before any destructive action is wired up.

## User Scenarios & Testing

### Primary scenario — single click

1. The user opens the Dedup custom app page and loads their library.
2. The playlist list renders one row per playlist.
3. The user clicks the **Dedup** button on the first playlist row.
4. The dev console receives one new line: `[Dedup] clicked: <playlist name> (<playlist uri>)` where `<playlist name>` and `<playlist uri>` exactly match the first playlist.

### Scenario — multiple clicks in sequence

1. With at least 3 playlists rendered, the user clicks the Dedup button on row A, then row B, then row C.
2. The console logs three lines, in click order, each identifying the playlist whose row was clicked, with zero mix-ups.

### Scenario — empty library

1. The loader returns zero playlists.
2. The list renders with no rows and therefore no Dedup buttons.
3. No console output occurs.

### Edge cases

- **Duplicate display names**: two playlists with identical `name` but distinct `uri` each log their own URI when their row's button is clicked.
- **Names with special characters** (quotes, emoji, RTL marks): logged verbatim without escaping or transformation.
- **Empty/whitespace `name`**: the name segment of the log is whatever the API returned (empty string is acceptable); the URI segment is always present and correct.
- **Keyboard activation**: pressing Enter or Space on a focused Dedup button triggers the same log behaviour as a mouse click.

## Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-001 | A "Dedup" button MUST render at the trailing edge (right side) of every playlist row in the loaded library list. | Approved |
| FR-002 | Each rendered button MUST be bound to exactly one playlist — the one whose row it appears in. | Approved |
| FR-003 | Activating a button (mouse click, Enter, or Space) MUST emit exactly one line to the dev console in the format `[Dedup] clicked: <playlist name> (<playlist uri>)`. | Approved |
| FR-004 | The logged `<playlist name>` and `<playlist uri>` MUST match the playlist the button is bound to, regardless of click ordering, list length, or duplicate names elsewhere in the list. | Approved |
| FR-005 | If the loaded playlist list is empty, no Dedup buttons render and no log output occurs. | Approved |
| FR-006 | The button MUST be rendered for every playlist the loader returns, with no filtering by ownership, collaborator status, or any other attribute. | Approved |
| FR-007 | The button MUST NOT mutate, request, or persist anything: no network calls, no Spicetify API calls, no local-storage writes, no state updates beyond what React already does for the row render. | Approved |

## Non-Functional Requirements

| ID | Requirement | Threshold | Status |
|---|---|---|---|
| NFR-001 | Keyboard reachability | The button is included in the page tab order and is activated by Enter or Space when focused. Verified by a Testing Library `userEvent.keyboard` assertion. | Approved |
| NFR-002 | Accessible name | The button exposes an accessible name that includes the word "Dedup" and the playlist name (e.g. `aria-label="Dedup playlist <name>"`). Verified by `getByRole('button', { name: /Dedup playlist <name>/ })`. | Approved |
| NFR-003 | Layout non-regression | Adding the button MUST NOT visually hide or truncate the existing playlist name and count fields in any row of a 5-row fixture rendered at the existing test viewport. Verified by snapshot-free DOM assertions on row content. | Approved |
| NFR-004 | Test coverage | 100% line and branch coverage on the new button component and any handler module introduced for the log emission, enforced by Vitest coverage thresholds in CI. | Approved |

## Constraints

| ID | Constraint | Status |
|---|---|---|
| C-001 | The click handler does exactly one thing: write the specified format string to the dev console. No real or stubbed deduplication logic, no confirmation dialog, no toast. | Approved |
| C-002 | No new runtime dependencies. The implementation uses the existing React/TypeScript/Spicetify stack only. | Approved |
| C-003 | Strict file-level SRP per charter `DIRECTIVE_001`: the button is its own component file; the log-emission helper, if extracted, is its own file. | Approved |
| C-004 | TDD per charter `DIRECTIVE_034`: every new file lands with a failing Vitest test written first, then the implementation. | Approved |
| C-005 | Boundary testing per charter on the list-length axis: explicit tests for 0 playlists (zero buttons), 1 playlist (one button), and N≥3 playlists with separate assertions on the first, middle, and last row. | Approved |
| C-006 | Black-box test posture per charter `DIRECTIVE_036`: tests exercise the rendered DOM and observe `console.log` via a spy; they do not poke component internals or private callbacks. | Approved |
| C-007 | An ADR under `.claude/adr/` records the choice of console-only confirmation as the temporary diagnostic surface, with a note that the next mission replaces it. | Approved |

## Success Criteria

- **SC-001**: Given a fixture of 5 playlists with two sharing the same display name, clicking each row's button produces 5 console lines that each correctly identify the playlist's URI. Verified by an automated test.
- **SC-002**: An empty playlist fixture renders zero buttons and produces zero console lines on any user interaction with the list region. Verified by an automated test.
- **SC-003**: A keyboard-only user can tab to a Dedup button and activate it with Enter or Space, producing the same console output as a mouse click. Verified by an automated test using `userEvent.tab` and `userEvent.keyboard`.
- **SC-004**: Vitest reports 100% line and branch coverage on all new files; CI fails if either drops.

## Key Entities

- **Playlist** *(existing, read-only here)*: identified by `uri` (string, e.g. `spotify:playlist:...`) and `name` (string). The exact shape of the loader's return value is established by the prior `get_library` mission and will be re-read during plan; this mission does not change that shape.
- **Dedup button** *(new)*: per-row component that takes one playlist and renders a single interactive element. Bound at render time to that playlist's `name` and `uri`. Activating it invokes the click-log helper.
- **Click-log helper** *(new, may be inlined or extracted)*: pure function that writes the agreed format string to `console.log`. If extracted, lives in its own file per SRP.

## Assumptions

- The existing playlist loader yields objects with at least `uri: string` and `name: string` fields. **To verify during plan** by reading the existing loader and its tests.
- The existing list rendering either already supports a per-row trailing action slot or can be modified to add one with a localized change. **To verify during plan**.
- "Dev console" means the Spicetify client's standard DevTools console (Chromium-based), reachable in development and to anyone running the extension. No production-only gating is required for this mission.

## Out of Scope

- Real deduplication logic of any kind (detection, removal, confirmation flows).
- Toast notifications, modals, or any user-visible feedback beyond the button's existence.
- Bulk dedup, multi-select, or "dedup all" affordances.
- Per-button disabled/loading/selected states.
- Spotify Web API or internal GraphQL calls.
- Visual styling beyond the minimum needed to place the button at the trailing edge of the row.
- Internationalisation of the log message format (English-only literal `[Dedup] clicked: …` is acceptable for a diagnostic).

## Dependencies

- The existing library loader and its rendered playlist list (from the merged `get_library` mission).
- React + TypeScript + Vitest + happy-dom + @testing-library/react (already in the project).

## Charter Alignment

| Charter element | How this spec satisfies it |
|---|---|
| `DIRECTIVE_001` Architectural integrity | C-003 mandates file-level SRP; button and log helper are isolated. |
| `DIRECTIVE_003` Decision documentation | C-007 requires an ADR for the console-only diagnostic choice. |
| `DIRECTIVE_010` Specification fidelity | FRs, NFRs, and SCs use stable IDs and are individually testable. |
| `DIRECTIVE_030` Quality gate | NFR-004 + C-004 lock in coverage and test-first development. |
| `DIRECTIVE_034` Test-first development | C-004. |
| `DIRECTIVE_036` Black-box integration testing | C-006. |
| No silent library mutations (charter risk boundary) | FR-007 + C-001 forbid any mutating side effect from the click. |
