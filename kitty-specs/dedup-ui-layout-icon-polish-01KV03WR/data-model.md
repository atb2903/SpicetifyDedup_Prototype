# Data Model: Dedup UI Layout & Icon Polish

**Not applicable — no data model changes.**

This mission is strictly presentational (spec §Summary, C-001). It introduces no
entities, fields, or state, and changes none of the existing ones:

- The `LoadState` and `DetectionStoreState` shapes, `DetectionResult`,
  `DuplicateGroup`/`GroupMember`, `RemovalTarget`/`RemovalOutcome`, and every
  view-model are **unchanged**.
- No new props are added to any component's public type surface. The row
  components add an internal layout wrapper element only; their `*Props` types
  are unchanged.

Refer to the duplicate-track-detection mission's `data-model.md` for the
authoritative domain shapes; this revision does not amend them.
