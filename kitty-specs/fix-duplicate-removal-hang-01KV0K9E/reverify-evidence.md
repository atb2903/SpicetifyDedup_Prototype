# WP04 / T014 — Live re-verification evidence (SC-001..SC-004 / C-004)

**Captured:** 2026-06-14, live on the Spotify desktop client (Spicetify v2.43.2).
**Build under test:** the full fix built from the `lane-a` worktree (commits WP02 `5637d76`,
WP05 `129f42b`, WP03 `a42d404`, WP04 `3a45f74`) → `npm run build` →
`~/.config/spicetify/CustomApps/spicetify-dedup/index.js` (deployed 01:07, 77 753 bytes — larger
than the pre-fix 75 622-byte bundle), `spicetify apply`, client reloaded (Ctrl+R).
**Repro playlist:** `spotify:playlist:6kLMODPV6Sfm9Vm399gpu0` — the same 2-song single-duplicate
playlist from the WP01 diagnosis (its duplicate was still present because the WP01 removal hung
without deleting anything).

**Driver protocol:** the assistant built/pushed/restarted; the user executed the console steps and
clicked. Order chosen deliberately: the **stall test ran first** (it removes nothing, preserving the
duplicate) and the **happy path second** (which consumes the duplicate).

## Part A — forced stall → timed-out message (SC-003 / SC-004) — ✅ PASS

- **Setup.** `Spicetify.Platform.PlaylistAPI.remove` was stubbed in the console to return a
  never-settling promise (`new Promise(() => {})`), modelling a hung host call.
- **Action.** Clicked **Remove**, cleared the confirmation; the row entered "removing…".
- **Result (user-confirmed).** Within the stall ceiling (~30 s) the row **left "removing…" and showed
  the plain-language timed-out message** — it did **not** report success and did **not** spin
  forever (SC-003). The user was then able to **retry/dismiss without restarting the client**
  (SC-004). The stub was removed afterward to restore real removal.

## Part B — real removal succeeds (SC-001 / SC-002) — ✅ PASS

- **Action.** With real removal restored, clicked **Remove** on the same playlist and confirmed.
- **Result (user-confirmed).** The duplicate was **actually removed**, the row reached a **success**
  terminal state with no hang (SC-001). Reopening the playlist showed it **down to one copy** — the
  duplicate is **actually gone** (backend state changed, not just local UI — SC-002).

## Verdict

All four success criteria pass live on the real client:

| Criterion | Result |
|---|---|
| SC-001 — Remove deletes exactly one duplicate, UI reaches success, no indefinite hang | ✅ PASS |
| SC-002 — reopening the playlist confirms the duplicate is actually gone (backend changed) | ✅ PASS |
| SC-003 — forced stall exits "removing…" into a visible timed-out state, never false success | ✅ PASS |
| SC-004 — user can retry/dismiss after a failed removal without restarting the client | ✅ PASS |

The original defect (infinite "removing…" + duplicate never deleted) is resolved end-to-end: WP05
restored the `uid` so removal actually fires and deletes; WP03's catch hardening guarantees a
terminal state on any failure; the stall ceiling + timed-out copy cover the resilience path.

> **Note on transcript fidelity.** The user reported the two parts as a confirmed pass ("A — yes,
> B — yes") against the explicit SC-001..SC-004 checklist above rather than pasting verbatim console
> lines. The behavioural outcomes that each SC asserts were each individually confirmed.
