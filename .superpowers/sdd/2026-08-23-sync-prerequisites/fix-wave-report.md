# Fix wave — whole-branch review of Tasks 4-10

Branch `feat/sync-prerequisites`, worked in place, nothing pushed.
Baseline at `abe0450`: 503 tests / 46 files. Final: **513 tests / 46 files**, lint clean, build clean.

| Commit | Fix |
|---|---|
| `c5107bc` | 1 — sidebar consumes repository order; shared top-level key space |
| `6509e2b` | 2 — `bulkImport` no longer reverses imported lists |
| `98ccb10` | 3 — `bulkImport` stamps every column it writes or resets |
| `0ddb353` | 4 — merge-mode dialog copy names the other devices |
| `8ecc443` | 5 — key derivation inside the transaction; `_tombstoneAbsent` chunking |

---

## Fix 1 — sidebar reordering (CRITICAL)

**What changed.**

- `Sidebar.tsx` no longer re-sorts the repository's answer. `projects` and `groups` arrive
  `ORDER BY sort_key`, so every derived list is consumed as given. The three `sortOrder` reads
  (the top-level memo, and the two id lists fed to `moveProject`) are gone.
- `ProjectFilter.tsx:57` and `DayDetailPanel.tsx:187-188` likewise consume repository order;
  the calendar panel ranks project ids by their index in `projects`.
- `createProjectGroup` no longer computes `MAX(sort_order) + 1`. It writes `sort_order = 0`
  like every other create path, so the row is in one place, not two.
- `Project` and `ProjectGroup` gained `sortKey: string`. `sortOrder` is kept and marked
  `@deprecated` **on purpose** — see "what I could not do" below.
- The optimistic stores (`store/projects.ts`, `store/projectGroups.ts`) now prepend a created
  row instead of appending, matching the head key the repository gives it. That was a third
  disagreement of the same kind as the `MAX(sort_order)` one.

**The design ruling: one shared key space.** `KEY_SPACE` in `sqlite-repository.ts` declares
`projects` and `project_groups` as one comparable space. Three things follow:

1. `_minKey`/`_headKey` take the minimum across **both** tables, so a new project sorts above
   every group as well as every project.
2. `_keyOf` looks the neighbour up across both tables. This is what lets `moveProject` anchor
   between two groups — previously `Sidebar.tsx` had to collapse a group neighbour to `null`,
   which dropped the project past every group it was meant to land beside. That collapse
   (`asProjectId`) is gone; the dnd id's prefix is simply stripped.
3. `backfillSortKeys` keys both tables in **one ordered pass** over their union, ordered by the
   `sort_order` they used to share. Keying them separately restarted both at the same first key
   and would have collapsed the old shared number line into a wall of ties — the migration would
   have "succeeded" and destroyed every existing user's top-level order.

It was workable, so nothing is stopped. The care the ruling anticipated was exactly in (1) and
(3): a head key for a top-level item has to consider both tables, and so does the backfill.

**`moveProjectGroup`: conclusion.** Kept, not wired up. It has no UI caller because groups are
not draggable — the drag handler guards on `active.id.startsWith("project:")`, so no group drag
event ever reaches it. Making groups draggable is a feature, not a fix, and it needs its own
drop-intent design (a group dropped onto a group is not a merge). What the shared key space does
change is that the method is now *correct* rather than merely present: before, a group could only
be placed relative to other groups, which is meaningless in a list it shares with projects. It is
reachable through `useProjectGroupStore.moveGroup` and covered by tests.

**Unmasking.** Both maskers named in the review are gone:

- Component fixtures now carry a real `sortKey`; the uniform `sortOrder: 0` no longer decides
  anything because nothing sorts on `sortOrder`.
- `MemoryRepository.move*` no longer renumbers `sortOrder` 0..N-1. Projects and groups get real
  fractional keys in the same shared space as SQL; tasks are held in Map insertion order and
  `moveTask` reseats the map. `sortOrder` survives only as a creation counter that
  *deliberately disagrees* with the real order after any move, so a consumer still reading it is
  caught rather than flattered.

## Fix 2 — `bulkImport` reversed every list

`generateNKeysBetween(null, minKey, n)` runs once per table outside the loop and the keys are
assigned in payload order. This also removes an N+1 `SELECT MIN` from inside the transaction.

## Fix 3 — unstamped and discarded stamps in `bulkImport`

- `IMPORT_STAMPED_FIELDS` names every column each statement writes **or resets**. `OR REPLACE`
  is a DELETE-then-INSERT, so omitted columns come back NULL: tasks now stamp `completed_at`,
  `deleted_at` and `purged_at`; projects stamp `group_id`, `deleted_at` and `purged_at`; tags
  stamp `deleted_at` and `purged_at` (same defect, not named in the review).
- `group_id` was added to the projects column list, so a colliding project keeps its group.
- Prior stamps are read once per table into a Map (`_priorStamps`) and merged into, instead of
  passing `existing = null`. One unfiltered `SELECT id, field_updated_at` rather than one query
  per row, and no bound variable per payload id.

## Fix 4 — merge-mode copy

`mergeExplanation` now says the import lands "ici et sur vos autres appareils synchronisés" /
"here and on your other synced devices", in both locales. The negative test was replaced by two:
merge *does* name the other devices, and merge does *not* claim to delete anything — which is the
real distinction between the modes.

## Fix 5 — minors

- `_minKey`/`_headKey`/`_keyOf` take a `tx` and every call site passes it; the derivation itself
  moved inside the transaction that writes the key (`createProject`, `createProjectGroup`,
  `moveTask`, `moveProject`, `moveProjectGroup`). `createTask` is untouched: it is not wrapped in
  a transaction at all, so there is no `tx` to pass.
- `_tombstoneAbsent` diffs the absent set in memory and chunks the UPDATE at 500 ids
  (`ID_CHUNK_SIZE`), instead of binding one variable per kept id.

---

## Per-test falsification

Every assertion below was verified by stripping the production change it targets, confirming red,
and restoring. No test was accepted on a passing run alone.

| Test | Technique | Result |
|---|---|---|
| `Sidebar — rendered order > draws projects in repository order after a move` | Restored the `sortOrder` sort in the `sidebarItems` memo, keeping the MemoryRepository fix (otherwise the double masks it, which is the whole point) | Red: rendered `Alpha, Beta, Gamma`, expected `Alpha, Gamma, Beta` |
| `moveTask > keys a project between two groups from one shared space` | Set `KEY_SPACE.projects` back to `["projects"]` and `project_groups` to `["project_groups"]` | Red: `keyP < keyG1` false — both landed on `a0` |
| `bulkImport under sync > keeps the payload order of an imported task list` | Restored the per-row `_headKey` inside the tasks loop | Red |
| `bulkImport under sync > keeps an imported list above the rows already present` | Same strip | Red |
| `bulkImport under sync > stamps completed_at on an imported task` | Restored the old task field list | Red. Presence is genuine here: `createTask` never stamps `completed_at` |
| `bulkImport under sync > stamps purged_at when an import resurrects a tombstone` | Same strip | Red. Change-detection on `t`, not presence, because `deleteTask` already stamps `purged_at` |
| `bulkImport under sync > keeps a project's group through an import` | Removed `group_id` from the projects column list and its bound value | Red |
| `bulkImport under sync > keeps stamps for columns the import does not write` | Passed `null` to `stampFields` again, **keeping** the new field list, to isolate prior-stamp preservation from the field list | Red |
| `bulkImport under sync > tombstones more absent rows than one statement can bind` | Off-by-one in the chunk slice (`ID_CHUNK_SIZE - 1`) | Red. Honest scope: this pins the chunk loop, not the variable ceiling — see residuals |
| `ImportConfirmDialog > names the consequence for other devices in merge mode too` | Reverted `mergeExplanation` to the old copy | Red |
| `ImportConfirmDialog > does not claim merge deletes anything` | Rewrote the merge copy to say entries are "deleted and rewritten" | Red |

A first falsification attempt on three of the fix-3 tests produced **false negatives of the
falsification itself**: the strip script's indentation did not match and silently replaced
nothing, so the tests appeared to pass against "stripped" code that was in fact intact. Caught by
grepping the stripped file rather than trusting the script; the strips were reapplied with
assertions and all three then failed as expected. Worth recording, because a strip that does not
apply looks exactly like a self-passing test.

---

## What I could not do as specified, and residuals

- **`sortOrder` stays on `Project` and `ProjectGroup`.** The instruction asks for a test with
  "distinct legacy `sortOrder` values that contradict the intended result". Deleting the field
  would make that test inexpressible, and therefore unfalsifiable — the defect would be
  structurally impossible but nothing would prove the fix. Keeping the field is what let me run
  strip-and-confirm on the one test that mattered most. It is marked `@deprecated` and no
  production code reads it. Removing it is a follow-up that also touches the export format
  (`ExportData.projects` is `Project[]`), which is out of scope for a fix wave.
- **The chunking test is a pin, not a discriminator for the ceiling.** Proving the old `NOT IN`
  actually broke needs a payload past `SQLITE_MAX_VARIABLE_NUMBER` (~32k rows) seeded row by row,
  which is too slow for the suite. The test seeds 1200 rows across three chunks and catches a
  boundary error, which is how the fix itself can go wrong. Stated in the test's comment.
- **`MemoryRepository.createTask` still appends**, where the real repository puts a new task at
  the head. That divergence predates this wave and is not the masking the review identified;
  changing it would reshuffle task order for a broad set of unrelated tests. Flagged rather than
  fixed.
- **`MemoryRepository.bulkImport` keeps the payload's `sortKey`** instead of generating fresh
  head keys as SQL now does. Ordering through the double is still coherent; the fidelity gap is
  in *which* keys, not in the resulting order.
- **No changelog entry was added.** Everything fixed here is unreleased work on this branch, so
  there is no user-visible delta against the last release to describe — with one exception worth
  a decision before merge: a newly created project or group now appears at the **top** of the
  sidebar rather than the bottom, in the optimistic view as well as after reload. That is the
  project/group counterpart of the Task 5 ruling on new tasks, which was agreed with the user but
  also never changelogged. If the task change is going to be announced, this should be in the
  same entry.
- **No lint suppression was needed or added.** The two pre-existing `oxlint-disable` comments in
  `backfill-sort-keys.ts` were carried over with their text updated from "per table" to "per key
  space"; no new ones.
- **IMPORTANT 5 from the review (`does not import until the user confirms` cannot fail) was left
  alone**, as instructed — it was listed as a coverage gap in `SettingsDialog.tsx:960-993`, not a
  defect, and was not in the fix list.
