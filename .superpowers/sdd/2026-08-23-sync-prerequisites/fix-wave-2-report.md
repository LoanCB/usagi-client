# Fix wave 2 report

Branch `feat/sync-prerequisites`, on top of `8ecc443`. Two commits, nothing pushed.

- `8a4e420` — fix 1 (Critical): import no longer fails when the backup's project group is absent locally.
- `86ec4e9` — fix 2 (Important): discriminating test for the shared projects/project_groups key space.

Verification after both commits: `pnpm test:run` 517 tests / 46 files passing (was 513 / 46, +4 new, none removed), `pnpm lint` clean, `pnpm build` clean.

---

## Fix 1 — importing a backup no longer fails on a device lacking the project's group

`src/db/sqlite-repository.ts` — `bulkImport`, projects loop.

`bulkImport` now reads the local `project_groups` ids once inside the transaction and
substitutes `NULL` for any `group_id` the payload names that is not present locally:

```ts
p.groupId !== null && localGroupIds.has(p.groupId) ? p.groupId : null,
```

The lookup is one unfiltered `SELECT id FROM project_groups` per import, not per project,
so it costs one statement regardless of payload size and binds no variables — the same
shape as the existing `_priorStamps` read directly below it.

**The stamping requirement was already satisfied and is now load-bearing.** `group_id` is
in `IMPORT_STAMPED_FIELDS.projects`, so the row's `field_updated_at` records the write
whether the value survived or was nulled. That is what makes the ungrouping propagate as a
real change instead of an unstamped NULL that loses to any remote `group_id` on the first
sync. A test pins it, so removing `group_id` from that list now fails rather than silently
degrading.

### Deliberately left out of scope

**`ExportData` still has no `projectGroups` array.** This change makes the import survive
the missing group; it does not make the group come back. A user restoring onto a fresh
install still loses their grouping — silently ungrouped, which is precisely the defect the
previous wave was trying to fix when it introduced the FK failure. Adding `projectGroups`
to `ExportData` is the fuller fix, and it changes the on-disk export format: it needs its
own decision about version bumping and about how a v1 backup (no groups array) and a v2
backup are told apart on read. Recorded here so it is not lost.

Note also that `MemoryRepository.bulkImport` was left alone. It has no referential
integrity, so it has no failure to fix — but that is exactly why it cannot be the harness
for this case.

### Test evidence — per test, with the strip used

Three tests added in `src/db/sqlite-repository.test.ts`, in a new describe block
`bulkImport — a project whose group is absent locally`, running against
`BetterSqliteDriver` (real SQLite, `foreign_keys = ON`, full migration set). Using
`MemoryRepository` here would have passed before the fix, for the wrong reason — that is
how this regression reached a re-review undetected.

**Before the fix (test written first):** 2 of 3 failed with
`SqliteError: FOREIGN KEY constraint failed`, `code: 'SQLITE_CONSTRAINT_FOREIGNKEY'` —
reproducing the reviewer's report exactly, from `sqlite-repository.ts:1089`.

**Strip used:** a Python literal replacement of the exact tab-indented ternary back to
`p.groupId,`, with `assert s.count(old) == 1` — so a strip that matched nothing, or matched
twice, aborted instead of silently replacing nothing. This is the failure mode that
produced three false negatives in the previous wave.

**Confirmed the strip landed** by grepping the stripped file: `grep -n "localGroupIds.has"`
returned no matches, and `grep -n "p.groupId,"` returned the reverted line 1110. Only then
was the suite run.

| Test | Under the strip |
| --- | --- |
| `imports it ungrouped instead of failing the whole transaction` | RED — `promise rejected "SqliteError: FOREIGN KEY constraint failed" instead of resolving` |
| `stamps the group_id it nulled, so the ungrouping propagates` | RED — same FK error, the import never reaches the assertion |
| `keeps group_id when the group does exist locally` | GREEN, correctly — this is the unaffected path, and it guards against "fix" it by always nulling |

Restored by the inverse replacement under the same `count == 1` assertion, re-grepped to
confirm the guard was back at line 1110, and the file re-run: 115/115 passing.

## Fix 2 — the shared key space now has a test that can fail

`src/db/backfill-sort-keys.test.ts` — one test added,
`keys projects and project_groups into one shared space, interleaved`. No production code
changed; `git diff` on `backfill-sort-keys.ts` is empty.

Seeds `project_groups` at `sort_order` 0 and 2 and `projects` at 1 and 3, so the legacy
ordering line alternates between the tables, then asserts on a `UNION ALL` of both tables
ordered by `sort_key`.

The assertion checks **distinctness before order**, deliberately. Per-table keying restarts
both tables at `a0`, so the two tables collide rather than merely mis-order; a bare order
assertion could have passed on whichever tied row SQLite happened to return first. Checking
`new Set(keys).size === keys.length` first makes the failure deterministic instead of
dependent on SQLite's unspecified tie order.

### Test evidence — strip used and how it was confirmed

**Strip used:** `KEY_SPACES` replaced with `[["tasks"],["projects"],["project_groups"]]`,
again via an exact literal Python replacement guarded by `assert s.count(old) == 1`.

**Confirmed the strip landed** by grepping the stripped file — `grep -n -A4 "^const KEY_SPACES"`
showed the three separate single-table entries — before running anything.

**Result under the strip: 1 failed, 9 passed.** The new test was the only one to go red.
That is the finding restated as evidence: all nine pre-existing tests, including
`backfills projects and project_groups too, not just tasks`, pass under per-table keying,
which is why the wave that could have broken this ordering would have shipped green.

Restored by the inverse replacement under the same assertion; `git diff --stat` on
`backfill-sort-keys.ts` returned empty, confirming the source is byte-identical to what was
committed, and the file re-run: 10/10 passing.

## Concerns

1. **The export format gap is still open** (see above). The Critical failure is gone, but
   restoring onto a fresh install still silently ungroups every project. It is now a
   correctness gap in the export format rather than a crash, which is the right shape of
   problem to leave, but it should not be left indefinitely — it is the primary use of the
   export feature.
2. **The same missing-referent failure exists for `tasks.project_id` and `tags.project_id`,
   and I confirmed it with a throwaway probe.** Both carry `REFERENCES projects(id)`
   (`001_initial.sql:15`, `004_tags_project_scope.sql:1`). A `bulkImport` of a task or a tag
   naming a project that is not present locally raises the identical
   `FOREIGN KEY constraint failed` and rolls the whole import back. The probe was run and
   deleted; no test for it was left in the tree, and no production code was changed for it.

   This is reachable from the UI, not just in theory. `dataTransfer.ts:52-53` sets
   `projects: []` when the "projects" checkbox is unchecked and no project filter is
   active — while still exporting tasks that carry `projectId`. So **exporting with
   "projects" unchecked produces a backup that cannot be imported onto any device where
   those projects do not already exist.**

   I deliberately did not fix this: it is outside the two assigned findings, and the fix is
   a real design question rather than a one-line guard. Nulling `project_id` the way fix 1
   nulls `group_id` would silently move every task to the Inbox, which is a much larger
   loss of user data than silent ungrouping and probably wants a different answer (refuse
   the import with a clear message, or synthesise placeholder projects). It belongs with
   the `ExportData`/`projectGroups` decision in concern 1 — they are the same question about
   what a backup is obliged to carry.
