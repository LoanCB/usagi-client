# Fix wave 3 report

Branch `feat/sync-prerequisites`, on top of `86ec4e9`. One commit, nothing pushed.

Closes concern 2 of the wave 2 report — `tasks.project_id` and `tags.project_id` naming a
project the importing device does not have — and four further failures in the same function
that the probe for it turned up.

Verification: `pnpm test:run` 550 tests / 47 files passing (was 517 / 46: 34 added, 1
moved to real SQLite and removed from the mock block, +1 file), `pnpm lint` clean,
`pnpm build` clean.

---

## The findings, all confirmed by throwaway probe before anything was written

Six, not the two in the brief. Every one aborts `bulkImport`'s single transaction, so a
valid backup restores nothing and `SettingsDialog` reports `data.importError` — "invalid or
corrupted file".

| | Reference | Error | Reachable by |
| --- | --- | --- | --- |
| A | `tasks.project_id` → project absent | `SQLITE_CONSTRAINT_FOREIGNKEY` | exporting with "projects" unchecked, restoring anywhere else |
| B | `tags.project_id` → project absent | `SQLITE_CONSTRAINT_FOREIGNKEY` | same |
| C | `task_tags.tag_id` → tag absent | `SQLITE_CONSTRAINT_FOREIGNKEY` | exporting with "tags" unchecked, merge mode |
| **E** | `task_tags.tag_id` → tag *exported* but `OR IGNORE`d on `UNIQUE(name)` | `SQLITE_CONSTRAINT_FOREIGNKEY` | **any two-device merge where a tag name already exists locally** |
| **F** | `_tombstoneAbsent` blanks `tags.name` to `''`, which is `NOT NULL UNIQUE` | `SQLITE_CONSTRAINT_UNIQUE` | **any replace import leaving two or more tags out of the backup** |
| D | `replace` leaves a task on a project it tombstoned in the same transaction | none — silent | any replace import narrowing the project set |

**E and F are the severe ones, and neither was in the brief.** They do not need an unusual
export: E fires on the ordinary two-device merge of a complete backup, because `tags.name`
is globally `UNIQUE` (`001_initial.sql:28`, never rebuilt by a later migration) so the same
tag carries a different id on each device. F fires on essentially every replace import,
because two tombstoned tags both get `name = ''`. The unchecked-projects route that opened
this investigation is the rarest of the six.

D is not a crash and is the one case that needed spotting rather than reproducing: a
tombstone still satisfies the foreign key, so the row survives — attached to a purged
project that `getProjects` (`WHERE purged_at IS NULL`) never returns. The task is imported
and then invisible.

Probes were run and deleted; `git status` was checked clean of them before the first test
was written.

## The decision — resolve late, null with consent

Recorded because the brief asked for it explicitly and warned against copying fix 1 by
reflex.

**Rule: resolve every foreign key against what is actually present locally at write time,
never fabricate a referent, and report the degradation before the transaction runs.**

- A, B → `NULL` (task to the Inbox, tag unscoped)
- D → resolve against *live* projects, so a tombstoned project counts as absent
- C, E → remap the link to the local tag of the same name; drop it only if there is none

**Not synthesised placeholder projects.** A fabricated row is stamped `now` with the real
device id, so under per-field LWW it *wins* against the true project record on the other
devices and overwrites its name — a worse loss than the one it repairs. Leaving it
unstamped instead leans on merge-engine behaviour for a stampless field that §5 does not
specify and that no code on this branch implements.

**Not a refusal.** A restore is the one moment refusing is unaffordable: if the source
device is gone, refusal turns a partial loss into a total one. It also contradicts §5.3 of
the design spec, which already commits to *« les orphelins sont réparés, pas ignorés — le
client rattache les tâches orphelines à l'Inbox plutôt que de rejeter l'enregistrement »*.
Nulling to the Inbox is not a new policy invented here; it is the project's existing orphan
rule, applied one layer earlier.

**C and E deliberately do not follow that rule.** The `OR IGNORE` in the tags loop already
decided the local row wins a name collision — its own comment says so — but nothing then
redirected the incoming links to it. `UNIQUE(name)` guarantees at most one candidate, so
remapping finishes a decision the code had already made. Dropping instead would silently
lose tag assignments on every cross-device merge, which is the common case.

**The export format does not change.** Keeping `projectId` in the file is what lets the
same tasks-only backup restore *intact* onto the device it came from and degrade only where
the project is genuinely gone. Stripping the reference at export time would force the Inbox
even on a same-device restore. This also keeps §9.4's "le format d'export ne change pas"
intact.

## What changed

`src/db/import-resolution.ts` — new. The rules as pure functions: `resolveProjectRef`,
`resolveTagLink`, `predictReferents`, `countImportGaps`, and the `ImportGaps` shape. One
place per rule, shared by the import, the preview and the harness.

`src/db/sqlite-repository.ts`:
- `bulkImport` reads its referents live from its own transaction — projects after the
  projects loop (`:1177`), tags after the tags loop (`:1224`) — so a row the payload
  carries itself counts, and a purged one does not.
- `_tombstoneAbsent` blanks a tag to `name = id` rather than `''` (`:1311`). Unique by
  construction, and it carries no user content, which is all the blanking was ever for.
- `previewImport` (`:1051`) — the same rules, read-only, for the dialog.
- The `exportedTagIds` special case is gone: the general resolution subsumes it, and
  handles merge mode too, which it never did.

`src/components/layout/ImportConfirmDialog.tsx` — takes `gaps` per mode and names the
counts. Both modes are precomputed because the dialog owns the mode toggle and a replace
can inbox tasks a merge of the same file would leave alone.

`src/components/layout/SettingsDialog.tsx` — `pendingImport` now carries its gaps as one
value. They are only meaningful together: the gaps describe *this* payload against the rows
present *now*, so a pendingImport without them would let the dialog ask for consent it
cannot describe. Both previews run inside the existing `try`, so a payload that parses but
cannot be resolved still reports as a bad file.

`src/test-harness/MemoryRepository.ts` — resolves through the same module in `bulkImport`,
and implements `previewImport`. See below.

`src/i18n/locales/{en,fr}.ts` — six keys on the project's existing `_one`/`_other`
convention.

### The harness was the actual root cause of the review escape

`MemoryRepository.bulkImport` enforced no referential integrity, so it kept a `projectId`
pointing at nothing and handed store tests a state the real app cannot reach. That
divergence is *why* this class of bug survived a re-review — the wave 2 report says as much
about fix 1, and then this wave found five more of the same shape.

It now resolves through the same module as `SqliteRepository`, and
`src/test-harness/MemoryRepository.test.ts` (new, 5 tests) pins the two together by running
the same payload through both. A harness that behaves differently from the repository it
stands in for is a permanent source of false green.

For the same reason, two mock-driver tests that asserted the bind values of the
`task_tags` INSERT were moved to real SQLite: the mock cannot see whether the tag row
exists, which is the only thing that decides the outcome.

- `merge: upserts projects/tasks…` — lost its `INSERT OR REPLACE INTO TASK_TAGS`
  assertion; the statement-shape assertions it is really about remain.
- `replace: skips task_tags for tags not in export data` — removed and rewritten against
  real SQLite as `links only the tags a replace import carries`.

## Test evidence — the strip used, per fix

34 tests added: 23 in `sqlite-repository.test.ts` (new describe block, `bulkImport —
references the payload names but this device lacks`), 6 in
`ImportConfirmDialog.test.tsx`, 5 in `MemoryRepository.test.ts`. Everything touching
referential integrity runs against `BetterSqliteDriver` — real SQLite, `foreign_keys = ON`,
full migration set.

Seven strips, each an exact literal replacement guarded by `assert s.count(old) == 1`, so a
strip matching nothing or matching twice aborted instead of silently replacing nothing.
Each strip was **confirmed landed** by re-reading the file and asserting the original text
was gone *before* the suite was run — the failure mode that produced three false negatives
in an earlier wave. Each was restored from an in-memory copy of the original bytes.

| Strip | Went red |
| --- | --- |
| `", name = id"` → `", name = ''"` | 2 — both F tests |
| `resolveProjectRef(id, liveProjectIds)` → `id` | 5 — A×2, B, D, and the drift test |
| `resolveTagLink(t, …)` → `t.id` | 5 — C, E, replace-tombstone, moved test, drift test |
| `predictReferents`: drop the replace branch | 1 — `counts a project a replace import would tombstone as absent` |
| `predictReferents`: drop the `OR IGNORE` replay | 1 — `keeps the local tag on a name collision, like SqliteRepository` |
| `hasImportGaps(gaps[mode])` → `false` | 4 — all four warning tests |
| `MemoryRepository`: keep `task.projectId` verbatim | 1 — `sends a task whose project is absent to the Inbox` |

Seven guard tests stayed green under every strip, which is what stops "fix it by always
nulling" from passing: `keeps a task's project when the payload carries that project
itself`, `keeps a task's project when only this device has it`, `keeps a tag's project
scope when this device has that project`, `keeps a tag link when the tag id itself is
present locally`, `reports nothing when this device can resolve the whole payload`, `says
nothing about gaps when the payload resolves completely`, `still lets the import through
once the gaps are shown`.

### One strip initially stayed green, and the code was kept

Stripping the `OR IGNORE` replay out of `predictReferents` changed nothing: 137/137 still
passed. The reason is real, not a missing case — for the *gap counts* the faithful model and
the naive union are equivalent. Both reduce to "does this id or this name exist in local ∪
payload", and a payload tag that `OR IGNORE` skips is skipped precisely because its id or
its name is already taken, so the predicate never differs.

The replay is still load-bearing, for `MemoryRepository.bulkImport`, which uses the same
referents to decide what to actually *insert*: under the naive union it inserts the
name-colliding tag too and ends up holding two tags sharing a name, a state the schema
forbids. The answer was the missing test, not deleting the code — `keeps the local tag on a
name collision, like SqliteRepository`, which pins it through the harness. It now goes red
under that strip.

Recorded because a green strip is normally the signal to delete the code, and here it was
not.

## Concerns

1. **`SettingsDialog` is untested, and this change added wiring to it.** The two
   `previewImport` calls and `pendingImport` carrying its gaps are covered only by types
   and by the dialog's own tests either side of them. The project has no
   `SettingsDialog.test.tsx` and no Tauri harness to build one on — `handleImportPick`
   reaches straight into `@tauri-apps/plugin-dialog` and `plugin-fs`. Not introduced here,
   but this change makes that panel do more than pass values through.

2. **`ExportData` still has no `projectGroups` array** — wave 2's concern 1, deliberately
   left. It was kept out because it is the only part of the problem needing an on-disk
   format decision (version bump, telling a v1 backup from a v2 on read), and coupling it
   would have parked five crashes behind a format debate. The gap dialog added here is the
   natural place to report missing groups when it does land.

3. **Checked and *not* a problem, recorded so it is not re-investigated: `replace` mode
   and tag name collisions.** Reasoning from the code suggested the tags loop's
   `OR REPLACE` would delete a tag `_tombstoneAbsent` had just tombstoned in order to take
   its name, destroying the tombstone so the deletion never propagates — the defect §9.4
   describes for `deleteProjectGroup`. Probed both orderings: it does not happen. Fix F
   removed it incidentally, because a tombstoned tag is renamed to its id and so no longer
   holds the name the payload wants. In the remaining case — a payload tag taking the name
   of a *live* tag the backup keeps and lists later — the row is deleted and re-inserted
   inside the same transaction and is present at commit, and `sync_outbox` is keyed by
   entity with `INSERT OR REPLACE`, so the two trigger firings collapse into one dirty
   marker. Verified by probe; no test left in the tree.

4. **`UNIQUE(name)` on `tags` is questionable under sync.** Fix F works around it rather
   than removing it, on the explicit instruction to keep the blast radius small. But two
   devices can each create a tag named "urgent" offline, and the merge engine of plan 4c
   will hit this same constraint on pull, where there is no user present to consent to
   anything. Worth deciding before 4c rather than during it.
