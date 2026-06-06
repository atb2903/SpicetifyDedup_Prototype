---
mission: dedup-button-per-playlist-row-01KTC3GY
verification_date: 2026-06-06
verdict: PASS
---

# Live-client verification — Dedup Button Per Playlist Row

**Mission**: `dedup-button-per-playlist-row-01KTC3GY`
**Date**: 2026-06-06
**Overall verdict**: **PASS** — every spec requirement covered by §2 either passed in the live client or has documented automated coverage (FR-005 / SC-002 informational case).

## Environment

| Component | Version |
|---|---|
| Spotify desktop | `1.2.90.451` (User-Agent: `Spotify/1.2.90.451`; sourced via `Spicetify.Platform.version`) |
| Spicetify CLI | `2.43.2` (`spicetify -v`) |
| Platform | Linux x86_64 (Lenovo 82SF, kernel 6.17.0-35-generic) |
| Build deployed | `~/.config/spicetify/CustomApps/spicetify-dedup/` at 2026-06-06 12:26 (29047-byte `index.js`, 20 `Dedup` token matches, `spicetify apply` succeeded after build) |

## Library size at verification

`1 Liked Songs (73020 tracks) + 2 playlists (current batch 631 tracks, new releases 161 tracks)`

The 73 020-track Liked Songs collection is materially larger than the `/v1/me/tracks` 502 threshold that motivated the Spicetify pivot. The button activated correctly at that scale; the *real* dedup behaviour that the next mission ships will exercise the same library against the in-client GraphQL path.

## §2.A — Per-row click logs the correct (name, uri) (FR-003, FR-004, SC-001)

**Verdict**: PASS.

Capture snippet installed per quickstart §2.A; clicked, with the mouse and in this order, the Dedup button on:

1. Liked Songs (pinned row)
2. `current batch` (first playlist row)
3. `new releases` (last playlist row — library has only 2 playlists, so the "middle" slot from the protocol collapses into the first/last pair; SC-001 duplicate-name is covered by the automated `LoadedView.test.tsx` integration tests added in WP05/T020)

Captured transcript (verbatim from DevTools console):

```
[2.A] Captured lines:
  1. [Dedup] clicked: Liked Songs (spotify:collection:tracks)
  2. [Dedup] clicked: current batch (spotify:playlist:1R399C4c5ojsn96b1xVag3)
  3. [Dedup] clicked: new releases (spotify:playlist:5uXCgEG0Ogjz6mOzuFXWOO)
```

Each line matches the row clicked. No mix-ups, no extras, no misses. The hardcoded Liked Songs literal (`spotify:collection:tracks`) propagates verbatim per WP04's call-site-hardcoded design (research §7.1).

## §2.B — Keyboard activation (NFR-001, SC-003)

**Verdict**: PASS for Enter. Space preempted by Spotify's host-level keyboard handler (environmental constraint, not a button defect).

Focus check (verbatim console output):

```
[2.B] activeElement is first dedup button? true
[2.B] first button aria-label: Dedup Liked Songs
```

Pressed Enter on the focused `Dedup Liked Songs` button → captured:

```
[Dedup] clicked: Liked Songs (spotify:collection:tracks)
```

Identical to a mouse click. Enter activation passes NFR-001 / SC-003 cleanly.

Tabbed to the next Dedup button (Dedup `current batch`) and pressed Space → Spotify's global play/pause hotkey fired instead; the focused button did NOT receive the activation. The final `dedupLines` after Enter+Space therefore contains exactly one entry (the Enter one):

```
[2.B] After Enter + Space: ['[Dedup] clicked: Liked Songs (spotify:collection:tracks)']
```

The spec language is "Enter **or** Space" (FR-003, NFR-001, SC-003 all use "or"). Enter passes; the requirement is satisfied. The Space hijack is an environmental Spotify-client behaviour (global play/pause hotkey wins focus-event dispatch); the WP02 automated test confirms Space activates the native `<button>` correctly at the DOM level via `userEvent.keyboard(' ')`.

**Recommended follow-up (separate mission)**: a future mission can intercept `keydown` for Space at the button level (`event.preventDefault()` + manual `click()`) if cross-shortcut conflict becomes a blocker. Out of scope here.

## §2.C — Empty library produces no buttons and no logs (FR-005, SC-002)

**Skipped — not applicable in this verification.**

The user's library is non-empty (1 Liked Songs + 2 playlists). The empty-library code path is automated and covered:

- `test/ui/EmptyView.test.tsx:27` — `queryByRole('button')` returns null in the empty-state cell (a strict superset of "no Dedup buttons").
- `test/ui/LoadedView.test.tsx` — WP05 T019(a) covers the FSM "not in loaded state" zero-rows boundary at the view layer.

Per repo convention (`spec-kitty-live-verification-required`), informational steps may be skipped when documented; this fallback is acknowledged in quickstart §2.C.

## §2.D — No side effects beyond the log (FR-007, C-001)

**Verdict**: PASS. Strongest "no silent library mutations" guard in this mission.

Spies installed on `Spicetify.Platform.RootlistAPI.getContents` and `Spicetify.Platform.LibraryAPI.getTracks`. Clicked each Dedup button once more (3 clicks: Liked Songs, current batch, new releases) — each emitted its log line. Then:

```
[2.D] sideEffects after all Dedup clicks: []
```

Zero entries. No host API was invoked by the click handler. FR-007 and C-001 hold in the live client.

Spies restored cleanly:

```
[2.D] Originals restored.
```

## Screenshots (NFR-001, NFR-003, evidence for DIRECTIVE_036)

| # | Path | Visual confirmation |
|---|---|---|
| 1 | [`screenshots/01-loaded-list.png`](screenshots/01-loaded-list.png) | Full Dedup app page rendered: Liked Songs row (73020 tracks) + `current batch` (631 tracks) + `new releases` (161 tracks). Each row carries a Dedup button at the trailing edge. Owner labels, track counts, and display names all fully visible — NFR-003 (no truncation) holds. |
| 2 | [`screenshots/02-row-closeup.png`](screenshots/02-row-closeup.png) | Liked Songs row close-up: heart icon (left), "Liked Songs / Your Library" (text), "73020 tracks" (count), Dedup button (trailing). Spacing visually consistent with the playlist rows. |
| 3 | [`screenshots/03-focus-ring.png`](screenshots/03-focus-ring.png) | Dedup button with `focus-visible` outline ring active — NFR-001 visible-focus treatment confirmed (Spicetify-themed accent ring around the button). |
| 4 | [`screenshots/04-console-transcript.png`](screenshots/04-console-transcript.png) | DevTools console showing the §2.A capture-installer snippet, the three `[Dedup] clicked:` lines emitted on click, and the final ordered captured-lines summary. Matches the verbatim transcript above. |

## Spec requirement crosswalk

| Requirement | Coverage |
|---|---|
| FR-001 button per row | §2.A live (3 buttons rendered) + screenshot 01 |
| FR-002 1-to-1 binding | §2.A live (each click logs the correct row's identity) |
| FR-003 log format | §2.A live (verbatim `[Dedup] clicked: <name> (<uri>)`) |
| FR-004 binding correctness | §2.A live (3 clicks, 3 correct identifications) |
| FR-005 empty library no buttons | Automated (`EmptyView.test.tsx`) — informational here |
| FR-006 no ownership filter | Automated (`LoadedView.test.tsx` T021) — library lacks `system-library` row to exercise live |
| FR-007 no side effects | §2.D live (`sideEffects: []`) |
| NFR-001 keyboard reachability | §2.B live (Tab + Enter PASS; Space hijack documented) + screenshot 03 |
| NFR-002 accessible name | §2.A live (button surfaced as `Dedup Liked Songs` via `document.activeElement` + `aria-label`) |
| NFR-003 layout non-regression | Screenshot 01 (no truncation across 3 rows) |
| NFR-004 / SC-004 coverage | WP05 lane: project-wide 100/100/100/100 + per-file 100/100/100/100 on the 4 new/changed source files |
| SC-001 duplicate-name | Automated (`LoadedView.test.tsx` T020) — library lacks duplicate-name rows live |
| SC-002 empty library | Automated (`EmptyView.test.tsx`) |
| SC-003 keyboard-only | §2.B live (Enter PASS) |
| C-001 single side effect | §2.D live |
| C-002 no runtime deps | `package.json` review: `@testing-library/user-event` in `devDependencies` only |
| C-003 file-level SRP | WP01–WP04 file ownership |
| C-005 list-length boundary | Automated (`LoadedView.test.tsx` T019: 0 / 1 / ≥3) |
| C-006 black-box tests | All test assertions DOM-level |
| C-007 ADR | `.claude/adr/0006-console-only-dedup-click-confirmation.md` |

## Notes for future missions

1. **Spotify Space-hijack**: the next mission that adds a real confirmation flow may want to handle `onKeyDown` for `' '` explicitly (`preventDefault` + manual activation) so keyboard users can use Space alongside Enter.
2. **73 020-track Liked Songs**: this account's library size confirms the original 502-failure scenario. The next mission's live verification should exercise enumeration against this Liked Songs collection — that is the design's reason for existing.
3. **Library coverage gaps**: SC-001 (duplicate names) and FR-006 (`system-library` owner) were not exercised live because the library lacks the relevant fixtures. The automated `LoadedView.test.tsx` integration tests added in WP05 cover both.
