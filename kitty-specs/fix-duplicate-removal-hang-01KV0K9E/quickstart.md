# Quickstart — Verify the Removal-Hang Fix

How to confirm the fix and resilience, in the order the mission requires: **live diagnosis first**
(capture evidence), then **TDD** (failing test → fix → green), then **live re-verification**.

## Prerequisites

- Repo deps installed; Spotify desktop with Spicetify loaded (live steps only).
- Test stack: Vitest + happy-dom (`npm run test:run`, `npm run test:coverage`).

## Step 0 — Reproduce + diagnose live (FR-001 / C-004)

1. Build & push to the client, then restart it (driver protocol — the assistant runs the
   push/restart; you click):
   ```bash
   npm run build-local      # emits dist/
   # copy dist into the Spicetify app folder + spicetify apply / restart client
   ```
2. Create the minimal repro: a **2-song playlist where both songs are the same track**.
3. Open devtools console, paste the instrumentation from `research.md` §R-2, then click
   **Remove**.
4. Record which host call is logged `CALLED` and whether it ever logs `RESOLVED`/`REJECTED`.
   - Neither → **hang confirmed** (primary hypothesis).
   - Immediate `REJECTED`/`TypeError` → a different root cause; follow research R-1 table.
5. Capture the transcript into **ADR-0017** as the C-004 evidence.

## Step 1 — Failing regression test first (C-003 / DIRECTIVE_034)

Write a store/integration test that drives a never-settling removal and asserts the row leaves
`removing`. Before the fix it MUST fail (hangs / times out the test):

```ts
// test/store/detection-store.test.ts (sketch)
const exec = new FakeRemovalExecutor({ kind: 'hang' });   // never settles
const scheduler = makeFakeScheduler();
const store = createDetectionStore(scanner, exec, scheduler);
// …drive to loaded, confirm to 'removing'…
scheduler.advance(STALL_CEILING_MS);                      // trip the ceiling
await flush();
expect(removalPhase(store, key)).toBe('partial');         // FAILS before fix
```

Run and watch it fail:
```bash
npm run test:run -- test/store/detection-store.test.ts
```

## Step 2 — Implement, then green

Apply the change (per `data-model.md`): add `'stalled'` to `RemovalErrorCode`, the `Scheduler`
seam + ceiling helper in the store, the `hang` fake script, and the `partial` timed-out copy.

```bash
npm run typecheck
npm run test:run
npm run test:coverage     # must remain 100% line/branch (charter)
```

Boundary cases to see passing (NFR-002): **under** the ceiling (normal success/partial, timer
cleared), **at** the ceiling (deadline-wins → `stalled`), **over** the ceiling (stall → `partial`).
Plus the **stall-vs-cancel** pair (reset mid-removal is swallowed, not `partial`).

## Step 3 — Live re-verification (SC-001..SC-004)

Rebuild, push, restart, then on the 2-song repro:

- Click **Remove** → exactly **one** copy removed, UI reaches **success**, no spinner-forever
  (SC-001). Repeat several times — zero hangs.
- Reopen the playlist → the duplicate is **actually gone** (backend changed, SC-002).
- Force a stall (e.g. console-stub `PlaylistAPI.remove` to a non-settling promise) → UI exits
  `removing` into a visible **timed-out** message within ~30 s, never reports success (SC-003).
- From that error, click **Remove** again (or dismiss) **without restarting** the client (SC-004).

## Done criteria

- [ ] ADR-0017 records the live-confirmed root cause + the stall-ceiling guard (SC-005, NFR-003).
- [ ] Regression test reproducing the original hang exists and passes after the fix (SC-005).
- [ ] `npm run typecheck` clean; `npm run test:coverage` at 100% line/branch.
- [ ] Live re-verification transcript/checklist captured (C-004).
