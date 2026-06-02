# Phase 0 Research — Load Dedup-able Playlists

**Mission**: `load-dedupable-playlists-01KT3XW3`
**Date**: 2026-06-02
**Status**: Resolved (no open `[NEEDS CLARIFICATION]` markers remain in the spec or plan)

This file consolidates every load-bearing technical decision behind the [plan.md](plan.md), explains the rejected alternatives, and lists the precise items that are deliberately deferred to implementation-time discovery. It is not a tutorial on Spicetify or React — see the in-repo background notes (`/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/spicetify-dedup-research.md`, `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/spicetify-ecosystem-research.md`) for that context.

---

## Decision 1 — Module architecture: Hexagonal (ports + adapters)

**Decision**: The feature uses a hexagonal layout. The domain (eligibility predicate, ordering, view-model transform, load-state FSM, error class) is pure TypeScript with no React, no Zustand, and no `Spicetify` global. A `PlaylistsLoader` port (a TypeScript interface) describes what the domain needs from the host. A production adapter implements the port against `Spicetify.Platform.RootlistAPI` and `Spicetify.Platform.LibraryAPI`; a fake adapter implements it in memory for store and UI tests. UI components read from a Zustand store and dispatch actions; the store calls the port through a constructor-injected reference.

**Rationale**:

1. The charter ([`.kittify/charter/charter.md`](../../.kittify/charter/charter.md)) demands a *named* architectural pattern at the start of any module-layout work, plus strict file-level SRP and 100 % line/branch coverage. Hexagonal is the pattern that simultaneously (a) satisfies "named", (b) makes SRP obvious (one file per port, per adapter, per domain concept), and (c) makes 100 % coverage tractable, because the only "hard-to-test" surface — the global `Spicetify` object — is isolated to a single adapter file behind a mockable interface.
2. The charter also requires fail-loud input validation at module boundaries. Hexagonal makes "module boundary" trivial to point at: it's exactly the adapter. Shape-validation logic lives there, in one place, paired with a classifier predicate.
3. Spicetify's `Platform` surface is officially documented as "internal, unstable, undocumented, may change drastically between versions" (per `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/spicetify-ecosystem-research.md`). Isolating it behind a port means future Spicetify breakages only touch the adapter, never the domain or UI. Realistic recurring cost for this project is "a small patch every ~1–3 months" per the ecosystem research — hexagonal makes those patches small.
4. The load-state machine is independently meaningful from the host. Pure-function transitions (`(state, action) → state`) test in milliseconds without `happy-dom`, React, or `vi.stubGlobal`.

**Alternatives considered**:

- **Layered (presentation / domain / data).** Conventional. Rejected because the "data" layer still ends up touching `Spicetify` directly, so its tests still need `vi.stubGlobal`, and you re-introduce a port to share fixtures with the upper layers — at which point the layout is hexagonal in fact if not in name. The charter requires the *name* anyway.
- **Feature-folder with SRP files** (`src/features/load-playlists/{fetch,transform,predicate,view,hook}.ts`). Lightest scaffolding, SRP-friendly. Rejected because it imposes no formal boundary around the Spicetify dependency: every test that exercises `fetch.ts` needs to mock the global, and there's no single "this is the host surface" file to capture knowledge in. The Spicetify ecosystem research file's "Defensive patterns to adopt from day one" — feature-detect each `Spicetify.Platform.*API` access, surface one unified "unsupported Spotify version" notification — has no natural home in this layout.

**ADR**: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/adr/0001-hexagonal-load-dedupable-playlists.md`.

---

## Decision 2 — Host API surface: Spicetify Platform APIs (RootlistAPI + LibraryAPI)

**Decision**: The production adapter uses `Spicetify.Platform.RootlistAPI` to enumerate the user's playlist tree (the source of "playlists I own" and "collaborative playlists I can edit") and `Spicetify.Platform.LibraryAPI` to retrieve the Liked Songs row's track count. The internal GraphQL endpoint (`api-partner.spotify.com/pathfinder/v1/query`, accessed via `Spicetify.GraphQL.Request(...)`) is deliberately not used in this iteration.

**Rationale**:

1. The spec is metadata-only (constraint C-002). Platform APIs return everything the spec requires — name, owner identity, track count, cover image, ownership / collaborative-edit flags — without hand-rolled GraphQL queries, persisted-query SHA256 management, or response-shape parsing.
2. Both Platform APIs go through the same internal pathfinder plumbing that the desktop client itself uses (`/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/spicetify-dedup-research.md` confirms this and notes the 502 immunity). They are the load-bearing reason this project exists as a Spicetify extension rather than a Web API consumer.
3. The data-porter reference implementation (`Prog-Jacob/spicetify-apps`, called out as "load-bearing reference for this project" in the ecosystem research file) uses `Spicetify.Platform.LibraryAPI.getTracks` directly. Its pagination pattern, the absence of inter-page delay, and the fact that it does *no* retry/backoff are empirical evidence that Platform APIs are reliable at the scales this project needs.
4. The Platform surface is typed `any` in `spicetify/cli/globals.d.ts` (verified at line 842 of `/home/alex/Documents/repos/SpicetifyDedup_Prototype/src/types/spicetify.d.ts`). The plan adds a narrow ambient type file `src/types/spicetify-platform.d.ts` declaring only the methods this iteration uses, with structural shapes that the adapter validates at runtime. This keeps `any` from leaking past the adapter boundary while not over-committing to typings that may shift across Spotify versions.

**Alternatives considered**:

- **Internal GraphQL via `Spicetify.GraphQL.Request`.** More flexible (one endpoint covers many shapes). Rejected for this iteration because (a) `Spicetify.GraphQL.Definitions` has no library/saved-tracks ops per the ecosystem research, meaning the operation name and persisted-query hash would have to be captured from DevTools and pinned in code — extra brittleness now for flexibility we don't need; (b) the spec is read-only metadata which Platform APIs already cover cleanly; (c) deferring to a later iteration when we genuinely need GraphQL (e.g. per-track enumeration with custom field selection) loses nothing.
- **Public Spotify Web API via `Spicetify.CosmosAsync.get(...)`.** Rejected outright: the project exists precisely because `GET /v1/me/tracks` 502s for large libraries. Even endpoints that work (e.g. `/v1/me/playlists`) impose rate limits documented at 2–3 s between calls (per the ecosystem research's notes on `harbassan/spicetify-apps` `stats`), making them strictly worse than Platform APIs for the same data.

**ADR**: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/adr/0002-spicetify-platform-apis-over-graphql.md`.

---

## Decision 3 — State management: Zustand

**Decision**: A single Zustand store (`src/store/playlists-store.ts`) owns the load-state FSM and the loaded data. The store exposes two actions — `triggerLoad()` and `retry()` — both of which transition the FSM and call the injected `PlaylistsLoader` port. UI components subscribe to selected slices of the store via the `usePlaylistsStore(selector)` hook.

**Rationale**:

1. This iteration is one cohesive FSM with a small action surface. A single Zustand store maps onto it 1:1 with minimal ceremony — state shape + actions in one file, no Provider wiring, no reducer/dispatch boilerplate.
2. Zustand stores are testable as plain functions: `const store = createStore(...)` returns an object with `getState()`, `setState()`, and `subscribe()` that exercises every transition without React. This satisfies the 100 %-coverage rule cheaply.
3. Selectors prevent unrelated re-renders: a row that subscribes to one playlist's view model doesn't re-render when an unrelated playlist updates. Important for the ≤1,000-playlist NFR-002 headroom.
4. ~1 KB gzipped, zero runtime peer deps beyond React. Doesn't bloat the Spicetify bundle (which already ships the entire React + Spotify UI runtime to the user).
5. The user's mental model — "this project is a single linear workflow" — aligns with Zustand's "one store per coherent unit" model better than Jotai's atomic decomposition.

**Alternatives considered**:

- **Local React state in a custom hook.** Simpler still. Rejected because the user explicitly chose to introduce a state library now ("zustand, this project is a single linear workflow") — paying the small cost now sets up later iterations (selection, scan progress, removal) to extend the same store instead of re-plumbing.
- **Jotai.** Strong for atomic decomposition. Rejected because the load state is *not* atomic — it's a discriminated union where all fields move together. Decomposing it into separate atoms is artificial and would force `useAtomValue` + `useSetAtom` calls everywhere a single `useStore(selector)` would do. See ADR `0003` for the full comparison.
- **React Context + reducer.** Adequate for tree-local state. Rejected because there is no scoping requirement (the Dedup page is a single-page surface) — Context's only advantage doesn't apply, while its disadvantage (re-renders the whole subtree when any field changes) does apply.

**ADR**: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/adr/0003-zustand-for-load-state.md`.

---

## Decision 4 — Retry semantics: manual-only

**Decision**: When the load fails, the page shows the failure state with a retry button. Clicking the button re-enters the loading state and re-runs `loader.load()`. There is no automatic retry, no exponential backoff, no hidden timer.

**Rationale**:

1. The spec is consistent about explicit user action being the only entry into `loading` (FR-011, FR-012, C-006, SC-6). Automatic retry would silently violate the same principle.
2. The charter mandates fail-loud behavior at module boundaries. Auto-retrying transient failures *hides* them — exactly the behavior the charter rejects.
3. The user's stated direction on the spec ("strive for algorithmic efficiency, but not specific times") cuts against any retry mechanism that bakes in timing constants (backoff durations, max-attempt counts).
4. Manual retry is the simplest implementation that satisfies FR-008 and NFR-004 and produces deterministic test scenarios.

**Alternatives considered**:

- **One silent auto-retry, then manual.** Rejected — introduces hidden timing the user can't predict, and contradicts the "explicit user action" theme established by the trigger model.
- **Exponential backoff up to N attempts.** Rejected for the same reason, more strongly.

No ADR — the decision flows directly from the spec's FR-008, FR-011, FR-012, and the charter's fail-loud rule. If the spec is followed, retry semantics fall out unambiguously.

---

## Deferred to implementation (not a clarification)

These items are not `[NEEDS CLARIFICATION]` markers — they don't block the plan, the data model, or the port contract. They are discoveries that happen during TDD against a live Spotify client, captured here so the implementer knows to expect them.

### Exact field names on `Spicetify.Platform.RootlistAPI`

The `Spicetify.Platform` namespace is typed `any` in `spicetify/cli/globals.d.ts` (see `/home/alex/Documents/repos/SpicetifyDedup_Prototype/src/types/spicetify.d.ts:842`). The ecosystem research file documents `Platform.LibraryAPI` precisely (from data-porter's `packages/shared/src/types/platform-api.ts`) but not `Platform.RootlistAPI`. Community sightings of the method name vary: `getContents`, `getRootlist`, `getFolder`. The shape of an "owned" vs "collaborative" item is undocumented.

**How implementation will resolve this**:

1. WP05 (the Spicetify adapter) opens the Spotify client with the extension loaded (`spicetify watch -a -l` + the Custom App registered).
2. In the client's DevTools console, the implementer evaluates `Spicetify.Platform.RootlistAPI` to enumerate its methods.
3. They call the candidate method and capture the response shape into a fixture file (`test/adapters/fixtures/rootlist-response.sample.json`).
4. The adapter is implemented against that fixture (validated structurally), with the runtime validator throwing a typed `PlaylistsLoaderError` if the live response ever drifts from the captured shape.
5. The captured shape is documented inline in `src/types/spicetify-platform.d.ts` so future maintenance starts from a known baseline.

**Why this is not a planning blocker**: the *domain* contract — what the loader returns, in domain terms (a list of `RawCollection`s plus a `LikedSongsSummary`) — is fully specified in `contracts/playlists-loader-port.md`. The adapter's *internal* mapping from Platform shapes to that contract is an implementation detail that doesn't ripple outward. If Platform's exact field names turn out to be different from any plausible guess, only `spicetify-playlists-loader.ts` and its test file change.

### Cover image URL conventions

Spotify's image references can come as either a direct CDN URL, a `spotify:image:<hex>` URI, or a multi-resolution array (`{ small, large, xlarge }`). The view-model's `imageUrl` field is `string | null`. The adapter resolves whatever shape Platform returns to a single best-effort URL (preferring the largest available); fallback to `null` triggers the placeholder image at the UI layer per FR-005.

### Detection of "collaborative + can edit"

The spec defines eligibility as *owned by the user* OR *collaborative AND the user has edit rights* OR *is Liked Songs*. The first and third are unambiguous. The second has two plausible representations in Platform's response: a single `canEdit: boolean` field, or a combination of `collaborative: boolean` + `permissions: { can_modify: boolean }`. The eligibility predicate in `src/domain/eligibility.ts` consumes a normalized `RawCollection.canEdit: boolean` produced by the adapter — wherever the truth comes from on Platform's side, the adapter normalizes it before handing it to the domain.

---

## Sources

- Spec: [`spec.md`](spec.md)
- Charter: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.kittify/charter/charter.md`
- Project notes: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/CLAUDE.md`
- Spicetify ecosystem research: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/spicetify-ecosystem-research.md`
- Spicetify dedup research: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/spicetify-dedup-research.md`
- Existing types: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/src/types/spicetify.d.ts`
- ADRs: `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/adr/0001-hexagonal-load-dedupable-playlists.md`, `0002-spicetify-platform-apis-over-graphql.md`, `0003-zustand-for-load-state.md`
