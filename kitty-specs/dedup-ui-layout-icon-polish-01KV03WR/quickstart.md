# Quickstart: Dedup UI Layout & Icon Polish

How to build, install, and **verify** this cosmetic revision. The visual NFRs are
not unit-testable (happy-dom computes no layout — see `research.md §2`), so the
live checklist below is the binding acceptance evidence and must be driven during
implement-review before any WP reaches `done`.

## Build & iterate

```bash
# from the repo root
npm run typecheck          # tsc --noEmit — must pass
npm run test:coverage      # vitest run --coverage — 100% line/branch, all green

# iterative in-client dev loop (rebuild + live reload into the client):
npm run watch              # spicetify-creator --watch
#   …and, if not already watching the client:
spicetify watch -a -l
```

First-time install (if needed):
```bash
spicetify config custom_apps spicetify-dedup
spicetify apply
```

## Gate checklist (runner-enforced)

- [ ] `npm run typecheck` passes (TypeScript strict).
- [ ] `npm run test:coverage` passes with **100% line and 100% branch** coverage.
- [ ] `test/architecture.test.ts` green (no new cross-layer imports from `src/ui/`).
- [ ] New/updated row tests assert the full-width **spanning wrapper** is present
      in each detection state (`loaded`, `scanning`, `failed`) for both
      `PlaylistRow` and `LikedSongsRow`, and that existing counts/fields/buttons/
      dialog copy are unchanged (FR-005).

## Live-verification checklist (visual — driven in the client)

Run against a real library that contains duplicates, in a **maximized desktop
window** unless noted.

**Sidebar icon (AS-1, AS-2 / FR-001, FR-002)**
- [ ] The Dedup sidebar entry shows the native `library` glyph — monochrome,
      `currentColor`, matching the weight/sizing of adjacent native icons — and is
      no longer the placeholder.
- [ ] The icon renders correctly in both the **default** and **active/selected**
      sidebar states (recolors with the native active treatment).

**Results layout (AS-2, AS-3 / NFR-001, NFR-002, NFR-003, FR-003, FR-004)**
- [ ] After clicking **Dedup**, results content occupies the available content
      width (no large empty band on the right); ≥ ~90% of content width at
      ≥1024px (NFR-001).
- [ ] A collection's primary result fields read on a **single line**, not a tall
      vertical stack (NFR-002) — check `loaded` summary, the **Remove** button,
      the confirm dialog, the progress line, and the partial-outcome line.
- [ ] The **scanning** progress line and a **failed** row's error message also
      render across the width, not crammed into the narrow column (the two
      additional affected surfaces).
- [ ] No horizontal scrollbar appears at window widths ≥ 768px (NFR-003).

**Edge cases (spec §Edge cases)**
- [ ] Narrow window: layout degrades gracefully, stays readable, no horizontal
      scrollbar.
- [ ] Long playlist/track names truncate with ellipsis without breaking layout or
      pushing siblings off-screen.
- [ ] "No duplicates found" summary renders correctly in the revised layout.
- [ ] A collection with many duplicate groups stays scannable.

**No-regression (AS-3 / FR-005, FR-006, C-001)**
- [ ] Every collection row, track count, track/artist field, Dedup button,
      confirmation dialog, progress indicator, and outcome message appears with
      the **same identity and count** as before — only position/sizing differ.
- [ ] Detection, confirmation (incl. bulk second-confirm > 25), removal, progress,
      and outcome behaviors function identically.
