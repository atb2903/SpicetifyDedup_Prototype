# Contracts: Dedup UI Layout & Icon Polish

**Not applicable — no new or changed interface contracts.**

This is a cosmetic-only mission (C-001/C-002). It defines no endpoints and alters
no programmatic contract:

- **No HTTP/GraphQL endpoints** are added or changed (no network calls at all).
- **Store API** (`scanCollection`, `requestRemoval`, `confirmRemoval`,
  `cancelRemoval`, `triggerLoad`, `retry`, …) is consumed exactly as today; no
  signature or behavior changes (FR-006).
- **Removal contract** (per-action confirm, bulk second-confirm > 25,
  keep-earliest semantics) is untouched — only the confirmation surface's width
  and placement change, not its logic, copy, or guarantees (charter risk
  boundaries preserved).
- **Component prop contracts** are unchanged: `DedupButton`,
  `RemoveDuplicatesButton`, `RemovalConfirmDialog`, `DetectionLoadedSummary`,
  `ScanningView`, `DetectionFailedView`, `RemovalOutcomeView`, `PlaylistRow`,
  `LikedSongsRow` keep their existing `*Props`.

The only "contract" affected is the visual/layout contract captured by the spec's
NFRs, which is verified via the live-verification checklist in
[`../quickstart.md`](../quickstart.md).
