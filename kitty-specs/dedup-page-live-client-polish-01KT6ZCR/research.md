# Phase 0 Research — Dedup Page Live-Client Polish

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**Date**: 2026-06-03
**Method**: Hybrid — code-archeology in plan to bound the decision space; each WP opens with a per-defect live-client probe before its failing test is written (engineering alignment, 2026-06-03).

All Phase-0 unknowns from `spec.md` §9 ("Plan-phase research questions, deferred, not blockers") are resolved below. Each resolution has the form **Decision / Rationale / Alternatives considered / Live-probe checkpoint** so the per-WP probe has a clear "confirm or escalate" gate.

---

## 1. P1 layout home (spec §9.1)

**Question**: Does the DedupPage own its own scroll surface + topbar offset, or render inside a Spicetify-provided main-view slot that already accounts for the topbar?

### Decision

`DedupPage` owns its own scroll surface and applies a topbar-aware `padding-top` via its own CSS module. **No selectors against Spotify's chrome class names** (e.g. `.main-topBar-container`) — those are hashed/rotating per Spicetify ecosystem research (`spicetify-ecosystem-research.md`: "Avoid Spotify's own CSS class selectors — they're hashed and rotate per build"). The topbar height is read from a CSS custom property with a hardcoded fallback derived from the 2026-06-03 live measurement (`y ≈ 110`):

```scss
// src/ui/DedupPage.module.scss (sketch — exact value confirmed by WP-01 live probe)
.page {
  height: 100%;
  overflow-y: auto;
  padding-top: var(--dedup-topbar-offset, 64px);
  padding-inline: var(--dedup-page-inline-padding, 24px);
}
```

The custom property is declared once (in `src/styles/_tokens.module.scss`, scoped to `:root` or to the page element). WP-01's live probe confirms the fallback value against the actual rendered topbar height.

### Rationale

- **Spicetify's custom-app slot is an empty container**: Spicetify mounts the React tree at a body-level slot that does not account for the fixed-position chrome. Confirmed via data-porter's `app.tsx` — its root `<ErrorBoundary>` has no className and no layout chrome; styling is delegated to its page components.
- **`elementFromPoint` at the button center hits the topbar** when the page renders flush against the top (spec §1, P1). A scroll container with `padding-top` ≥ topbar height puts the button's hit-zone below the chrome.
- **CSS custom property + fallback** is robust to topbar resizing across Spotify builds (assumption §6.1): the variable can be reassigned without changing component code, and the fallback survives even if the variable is never written.

### Alternatives considered

1. **Sticky-header offset inside DedupPage** — push the page's top padding via a `position: sticky` header. Rejected: cosmetically equivalent for the Load button alone, but compounds with scroll-container math when content overflows. Simpler not to introduce a sticky layer.
2. **Selector-based offset** (`.main-topBar-container ~ .dedup-page { padding-top: <measured>; }`) — rejected: contradicts the "no Spotify chrome selectors" rule and would silently break on Spotify reskins.
3. **Render inside `Spicetify.ReactComponent.PanelSkeleton` or similar slot** — rejected: ecosystem research notes those are designed for the right-hand panel, not the custom-app slot. Wrong primitive.

### Live-probe checkpoint (WP-01)

```javascript
// Paste in Spotify DevTools console after navigating to the Dedup page.
const btn = document.querySelector('button[aria-label="Load my dedup-able playlists"]');
const r = btn.getBoundingClientRect();
const cx = r.left + r.width / 2;
const cy = r.top + r.height / 2;
console.log({
  rect: { top: r.top, left: r.left, w: r.width, h: r.height },
  centerHitTarget: document.elementFromPoint(cx, cy)?.outerHTML?.slice(0, 200),
  topbarRect: document.querySelector('.main-topBar-container')?.getBoundingClientRect(),
});
```

**Confirm**: `centerHitTarget` resolves to the Load button (or a descendant) — **not** to a `.main-topBar-*` element. Capture the topbar's `bottom` value; that becomes the verified fallback for `var(--dedup-topbar-offset, …)`.

---

## 2. P2 styling home (spec §9.2)

**Question**: CSS modules (continue `.module.scss`), one global stylesheet, styled-components, or inline styles?

### Decision

**CSS modules, split per-component**: one `.module.scss` file per view component (`DedupPage.module.scss`, `IdleView.module.scss`, …, `PlaylistRow.module.scss`). Continues the `create-spicetify-app` scaffold's default pattern (the existing `src/css/app.module.scss` is the scaffold artifact); the per-component split satisfies the charter's strict file-level SRP without deviating from CSS modules. **No ADR-0004 needed**.

Per-component modules import a shared tokens fragment (`src/styles/_tokens.module.scss`) that aliases the Spotify CSS variables this mission relies on (`--spice-text`, `--spice-button`, `--spice-main`, `--spice-sidebar`, `--spice-card`, plus `--dedup-topbar-offset` from §1).

### Rationale

- **User pre-bias**: confirmed during engineering alignment (2026-06-03) — "Continue CSS modules but split per-component" if archeology doesn't surface a dominant pattern.
- **Archeology is not unanimous**: `Prog-Jacob/spicetify-apps`'s data-porter uses **one global `index.css`**, not CSS modules. `Pithaya/spicetify-apps` repo not directly probed (404 on the `tree/` URL). The pattern is community-divided; absent a dominant signal, defer to the project's scaffold default + user pre-bias.
- **File-level SRP**: each view component has its own stylesheet, so changes to one view don't risk regressing another's styling. The existing pattern of inlining string classNames like `"dedup-idle__copy"` already partitions selectors by component — converting them to `styles.copy` per file is mechanical.
- **`--spice-*` variables for themability**: ecosystem research mandates these for theme adaptation. The shared `_tokens.module.scss` is the single point of contact between the dedup app and the Spotify theme.

### Alternatives considered

1. **One global stylesheet (`src/css/dedup.scss`)** — matches data-porter's pattern. Rejected: contradicts the user's pre-bias and would re-introduce the cross-file selector conflicts that motivated CSS modules in the first place.
2. **Spicetify's existing utility classes (`main-type-*`, etc.)** — rejected per ecosystem research: those classnames are hashed/rotating across Spotify builds. Brittle.
3. **Styled-components / emotion** — rejected: adds a runtime dependency to a build that already has a CSS-modules story. No upside for this iteration.
4. **Inline styles** — rejected: poor SRP (style co-located with markup), no hover/focus pseudo-class support, no theme-variable inheritance.

### Live-probe checkpoint (WP-02)

After each view's `.module.scss` lands and the corresponding `.tsx` swaps from string classNames to `styles.*` imports, force the state in the running client and capture a screenshot:

```javascript
// Force a state from the DevTools console (replace `window._dedupStore` with the actual handle once exposed in WP-09 follow-up; for WP-02 probes, swap by navigating idle → loading via the Load button, or by mutating the store via React DevTools).
// Capture each of: idle, loading, loaded, empty, failed. Save under .claude/screenshots/wp02/.
```

**Confirm**: from a single glance, each of the five state views is visually distinct (SC-2 → NFR-006 evidence). Capture screenshots into a dated artefact alongside `quickstart.md`'s NFR-005 console transcript.

---

## 3. P3 lifecycle hook (spec §9.3)

**Question**: Does Spicetify unmount custom apps on navigation, or just hide them? Mount-time reset suffices if unmount; visibility-change or route-aware effect needed if hide-only.

### Decision

**Route-aware reset via a navigation port + adapter** (introduces ADR-0004 in WP-03):

- New port `src/ports/navigation.ts` declares `NavigationPort.subscribe(listener: (path: string) => void): Unsubscribe`.
- New adapter `src/adapters/spicetify-navigation.ts` wraps `Spicetify.Platform.History.listen(({ pathname }) => listener(pathname))` and returns the unsubscribe handle.
- A new `NavigationProvider` (or extending `PlaylistsStoreProvider`) wires the adapter into a React effect that calls `store.reset()` when the pathname returns to the dedup app from elsewhere **and** the current state is not `idle`.

**Starting hypothesis** (confirmed or revised by WP-03's live probe): Spicetify custom apps **stay mounted** across navigation (per ecosystem research and data-porter's own pattern of using `Platform.History.listen` for routing). Mount-time `useEffect(() => reset(), [])` therefore fires once per session, not per navigation — insufficient for FR-008.

If the live probe surprises us by showing DedupPage **does** unmount on navigation, the simpler `useEffect(() => reset, [])` cleanup is correct and the navigation port becomes a YAGNI artifact for this iteration. WP-03 chooses the simpler path if the probe permits.

### Rationale

- **Ecosystem research**: "Custom App … component stays mounted across user navigation" (`spicetify-ecosystem-research.md` §"Project type, scaffolding, dev loop").
- **data-porter precedent**: `apps/data-porter/src/app.tsx` uses `platform.History.listen(({ pathname }) => setPath(pathname))` to route between its own pages, then unsubscribes via the returned function. Same primitive answers our problem: subscribe in a React effect, unsubscribe on cleanup.
- **Architecture compliance**: `src/ui/` cannot import from `src/adapters/` per the architecture test. A port + adapter + store-side wiring keeps the UI thin and the host access contained.
- **Mission-review evidence**: RISK-2 in `kitty-specs/load-dedupable-playlists-01KT3XW3/mission-review.md` already names this exact remediation: *"Implement a navigate-away reset (e.g. `useEffect` in `DedupPage` to call a store `reset` action on unmount when state is `loading`)"*. The plan upgrades "useEffect on unmount" to "history-listener" because of the ecosystem-research evidence that unmount may not actually fire.

### Alternatives considered

1. **Mount-time reset only** (`useEffect(() => reset(), [])`) — rejected as starting hypothesis: only fires once per ES-module load, not per navigation, given stay-mounted behavior.
2. **`document.visibilityState` listener** — rejected: catches tab-blur, not in-client navigation. Wrong signal.
3. **Direct `Spicetify.Platform.History.listen` inside `DedupPage`** — rejected: violates ADR-0001 by importing host access into `src/ui/`.
4. **Polling `window.location.pathname` on a `setInterval`** — rejected: wasteful and racy.

### Live-probe checkpoint (WP-03)

```javascript
// Paste into the Spotify DevTools console.
const unsub = Spicetify.Platform.History.listen((loc) => {
  console.log('[history]', loc.pathname, 'at', performance.now());
});
// Then navigate: Dedup sidebar → Home → Dedup sidebar. Observe the log.
// To check unmount vs. stay-mounted: log a component-id from a useEffect with empty deps,
// add `console.log('[DedupPage] mounted', Date.now())` in a one-off devtools instrumentation,
// observe whether the message appears once per session or once per navigation.
unsub();
```

**Confirm**: does `Platform.History.listen` fire on navigate-back? Does `DedupPage` re-mount, or is the same instance reused? The result decides whether the navigation port is needed (stay-mounted) or whether mount-time reset is correct (unmount-on-navigate).

---

## 4. FR-001 test substrate

**Question**: Can `happy-dom` simulate a faux `.main-topBar-container` fixed-position overlay with enough fidelity that `elementFromPoint(buttonCenter)` returns the topbar when the dedup page renders flush, and returns the button when the fix lands?

### Decision

**Try happy-dom + faux topbar first; fall back to computed-style overlap check** (confirmed at engineering alignment, 2026-06-03).

Test shape:

```tsx
// test/ui/DedupPage.test.tsx (sketch)
it('Load button is not occluded by host chrome (FR-001)', () => {
  // Render a faux topbar overlay above DedupPage:
  document.body.innerHTML = `
    <header class="main-topBar-container"
            style="position: fixed; top: 0; left: 0; right: 0;
                   height: 64px; background: #000; z-index: 999;"></header>
    <div id="root"></div>
  `;
  const { store } = makeStore('success');
  render(
    <PlaylistsStoreProvider store={store}>
      <DedupPage />
    </PlaylistsStoreProvider>,
    { container: document.getElementById('root')! },
  );
  const btn = screen.getByRole('button', { name: /load/i });
  const r = btn.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  // happy-dom path: assert the hit-target is the button (or descendant), not the topbar.
  expect(hit && (btn === hit || btn.contains(hit))).toBe(true);
});
```

If happy-dom's `elementFromPoint` does not honor stacking-context fidelity (known limitation in some happy-dom versions), the assertion is replaced by a computed-style overlap check:

```ts
const topbar = document.querySelector('.main-topBar-container')!.getBoundingClientRect();
const overlaps =
  r.left < topbar.right && r.right > topbar.left &&
  r.top < topbar.bottom && r.bottom > topbar.top;
expect(overlaps).toBe(false);
```

Both shapes assert the same contract — "the button is not occluded by chrome" — at different observability levels.

### Rationale

- **NFR-009**: the assertion must be automated and run inside `npm run test:run`, not gated on a manual step.
- **happy-dom 20.x** ships an `elementFromPoint` implementation; whether it honors fixed-position stacking contexts is version-dependent. Probing once in WP-01 settles it; either way, the contract holds.
- **Computed-style overlap** is observable, deterministic, and version-agnostic; it captures the same contract with a stricter shape (it forbids any geometric overlap, not just "the center hit-target is the button").

### Alternatives considered

1. **Skip the regression test; rely on the NFR-005 manual checklist** — rejected by NFR-009 ("the regression test gating FR-001 runs in `npm run test:run` (no out-of-band human step)").
2. **Architecture-test layout invariant** ("DedupPage must render inside an element whose computed `padding-top` ≥ topbar height") — rejected for the same reason as in the engineering alignment: pure structural assertion, brittle to genuine geometry bugs.
3. **Playwright end-to-end test against a headless Chromium** — rejected: out-of-band CI dependency for a single regression; happy-dom + faux topbar is sufficient.

### Live-probe checkpoint (WP-01)

Already captured in §1's snippet. The console output for `centerHitTarget` directly answers the happy-dom fidelity question (if real-Chromium says the hit-target is the button after the fix, happy-dom should agree).

---

## 5. FR-010 — `playlist-v2` URI type behavior

**Question**: Does the `'playlist-v2'` rootlist URI type behave identically to `'playlist'` for adapter purposes (same fields, same `isOwnedBySelf` filter semantics, same image URI shape)?

### Decision

**Treat `'playlist-v2'` as a structural alias for `'playlist'` in the adapter's `walkItems` branch**. The spec's assumption §6.4 explicitly carries this hypothesis ("If live probing during P4 reveals divergent behavior, the plan surfaces it as a refined requirement"). Live probe in WP-04 confirms.

Code change is one branch widening at `src/adapters/spicetify-playlists-loader.ts:141`:

```ts
// Before
if (type === 'playlist') { out.push(this.toRawCollection(node)); continue; }
// After (FR-010)
if (type === 'playlist' || type === 'playlist-v2') {
  out.push(this.toRawCollection(node));
  continue;
}
```

Fixture extension (FR-011): the existing `test/adapters/fixtures/rootlist-response.sample.json` (or a sibling) is augmented with at least one node typed `'playlist-v2'` and a unit test asserts that node appears in the adapter's output.

### Rationale

- **Data-model declares the contract**: `kitty-specs/load-dedupable-playlists-01KT3XW3/data-model.md` §3, table row "uri": *"Non-empty; `Spicetify.URI.fromString(uri).type === 'playlist'` or `'playlist-v2'`."*
- **Mission-review DRIFT-1**: `mission-review.md` calls out the spec-vs-code drift and frames it as "the textbook 'fixture-shaped tests pass; production behaviour silently truncates' failure mode."
- **NFR-010**: the spec mandates "either the adapter accepts both, or `data-model.md` §3 is amended in this mission's plan — not both half-done." The plan picks "accept both."
- **Empirical risk is bounded**: the 2026-06-03 user library had zero `playlist-v2` nodes (spec §2 edge cases). The fix has zero observed user impact today but closes a future-rollout silent-failure path.

### Alternatives considered

1. **Amend `data-model.md` to declare only `'playlist'`** — rejected: contradicts the prior mission's data-model intent and would silently drop a Spotify-side rollout. The drift is in the code, not the model.
2. **Use `Spicetify.URI.fromString(uri).type` instead of the node's `type` field** — rejected: spec §7 "Out of scope" explicitly lists "Adopting `Spicetify.URI.fromString` for type classification — the rootlist `type`-classifier approach stays."

### Live-probe checkpoint (WP-04)

```javascript
const r = await Spicetify.Platform.RootlistAPI.getContents();
console.log('rootlist types observed:', [...new Set(r.items.map(i => i.type))]);
console.log('counts:', r.items.reduce((m, i) => (m[i.type] = (m[i.type]||0)+1, m), {}));
```

**Confirm**: enumerate types in the actual library. If `'playlist-v2'` appears, capture one example node in the fixture; if absent, synthesize a fixture node matching the documented shape per spec assumption §6.4.

---

## 6. P5 — `triggerLoad` gate

**Question**: Where should the `idle`-state gate live — in the FSM `transition` function, the store action, or the UI gating?

### Decision

**Store action**, mirroring the existing `retry` gate at `src/store/playlists-store.ts:114-119`:

```ts
async triggerLoad() {
  const before = get().loadState;
  if (before.kind !== 'idle') return; // FR-012
  set({ loadState: transition(before, { type: 'trigger' }) });
  await runLoad();
},
```

### Rationale

- **Symmetric with `retry`**: same pattern, same test shape (`retry from idle/loaded/empty` already covers the equivalent no-op tests for retry). FR-013 mandates the same per-non-idle-state coverage for `triggerLoad`.
- **FSM `transition` already ignores `trigger` from non-idle** (it returns `state` unchanged), but the store still calls `runLoad()` regardless. Gating at the store action stops the host call, which is the real concern (RISK-3 in `mission-review.md`).
- **Not the UI's responsibility**: UI gating already exists (the page only mounts `IdleView` from the `idle` state), but the store-action gate makes FR-012 self-enforcing — a future contributor adding a "Reload" button cannot accidentally re-fire `loader.load()` from `loaded`.

### Alternatives considered

1. **Add the gate inside the FSM's `transition` function** — rejected: `transition` is a pure data function and already does the right thing (returns the state unchanged). The bug is in the store wiring, not the FSM.
2. **Add the gate at the React effect dispatching `triggerLoad`** — rejected: too far from the contract; future callers (a CLI test harness, a planned "Reload" button) would each need to remember to re-gate.

### Live-probe checkpoint (WP-05)

```javascript
// In DevTools console after navigating to Dedup and loading the library.
const s = window._dedupStore; // exposed for the probe; remove after
await s.getState().triggerLoad(); // expect: state still loaded, loader.load not called
console.log(s.getState().loadState.kind); // expect: 'loaded'
```

(Exposing `window._dedupStore` for the probe is a temporary diagnostic; final WP closes by removing the global.)

---

## 7. Out-of-scope items revisited

The plan explicitly does not resolve, and WP work explicitly defers:

- **`looksLikeAuthExpired` refinement** — parked per spec §7 ("Out of scope"). Empirical predicate stays as-is.
- **`spotify:mosaic:` cover rendering** — debunked per spec §1 (live measurement: 2 mosaic, 0 broken). No fix; no test changes. Prior mission's RISK-1 is closed.
- **Composite cover generation, row selection, manual-refresh affordance, design system** — all parked per spec §7.

---

## 8. Bibliography (sources consulted during archeology)

| Source | Used for |
|---|---|
| `.claude/spicetify-ecosystem-research.md` | Custom App layout pattern; `--spice-*` variable list; CSS-class hashing warning; `Platform.History` pattern; data-porter as load-bearing reference. |
| `.claude/spicetify-dedup-research.md` (via CLAUDE.md domain context) | 502 motivation, dedup algorithm out-of-scope here. |
| `kitty-specs/load-dedupable-playlists-01KT3XW3/data-model.md` | `playlist` / `playlist-v2` contract (FR-010), FSM transition table (P5). |
| `kitty-specs/load-dedupable-playlists-01KT3XW3/mission-review.md` | RISK-1 (debunked), RISK-2 (P3), RISK-3 (P5), DRIFT-1 (P4). |
| `https://github.com/Prog-Jacob/spicetify-apps/blob/main/apps/data-porter/src/app.tsx` (WebFetch) | `platform.History.listen` pattern; root component has no className; styling delegated to pages. |
| `https://github.com/Prog-Jacob/spicetify-apps/tree/main/apps/data-porter/src/styles` (WebFetch) | data-porter uses one global `index.css` — informs but does not override the project's CSS-modules pre-bias. |
| `src/adapters/spicetify-playlists-loader.ts:141` | Site of P4 fix. |
| `src/store/playlists-store.ts:110-119` | Site of P5 fix; pattern for FR-007 reset. |
| `src/ui/*.tsx` | Confirm string-className pattern (current state); confirm view components are presentation-only. |
| `test/architecture.test.ts` | Architecture rules (hexagonal boundaries enforced in CI). |
| `.kittify/charter/charter.md` | Directives in force; TDD + coverage + ADR requirements. |
| `.claude/adr/0001-hexagonal-load-dedupable-playlists.md` | Hexagonal pattern; why navigation must be a port. |
