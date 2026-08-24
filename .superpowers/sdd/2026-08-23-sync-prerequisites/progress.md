# SDD ledger — plan: docs/superpowers/plans/2026-08-23-sync-prerequisites.md

Spec: docs/superpowers/specs/2026-08-20-sync-offline-first-design.md §9 (reachable, amended today with the two resolved decisions).
Branch: feat/sync-prerequisites @ 57e49f5, worked in place in the main checkout — not a worktree. Ruling: removing a worktree earlier today deleted the user's gitignored `.env`/`.env.test` and their entire node_modules in the sibling repo, because `git worktree remove` discards ignored files without warning. The client repo's main checkout already has working dependencies and the branch already existed. Cost if wrong: the user's `develop` checkout is occupied by this branch while the plan runs.
Baseline: 435 tests / 43 files passing, lint clean.

## Pre-flight scan

### Task pairs sharing a file or an interface

| Pair | Produces → consumes | Finding |
|---|---|---|
| T1 → T8, T9 | `DbDriver.transaction` | Clean — both use it for atomicity |
| T1 → T2, T7, T8, T9 | harness helpers (`reopen`, `countWrites`, `failNextExecuteMatching`) | **F3** below |
| T2 → T3, T4, T5, T7, T8 | `getOrCreateDeviceId` | Clean — every stamping path needs it |
| T3 → T4, T5, T7, T8, T9 | `_stamp(table, id, fields, now)` and `_keyOf(table, id)` | Fixed pre-dispatch: the draft introduced `_stampTask` in T3 and re-introduced it generalised in T4, and used `_keyOf` in T7 without ever defining it. Both now land once, in T3. |
| T5 → T6, T7 | `_headKey(table)` | Clean |
| T6 → T7 | every row has a key before the read cutover | Clean — ordering is deliberate: the cutover would surface NULL keys otherwise |
| T7 → T8 | `ORDER BY sort_key` on projects/groups | **F1** below — the severe one |
| T8 → T9 | tombstone-instead-of-delete pattern | Clean — T9 reuses the shape T8 establishes |

### Per-task self-consistency

| Task | Finding |
|---|---|
| T1 | Clean once F3 is folded in |
| T2 | Test calls `db.reopen()` — see F3 |
| T3 | Clean |
| T4 | Draft said "sur le modèle de la Task 3", a forbidden placeholder. Replaced with concrete test code pre-dispatch. |
| T5 | Clean. Note it deliberately changes observable behaviour — see the ruling below. |
| T6 | Clean |
| T7 | **F1** |
| T8 | **F2** |
| T9 | Draft described the change without showing it. Replaced with the `replace`-mode code pre-dispatch. |
| T10 | Clean |

### Findings and rulings

**F1 (severe) — T7 would have silently broken the sidebar reorder.**
`reorderProjects` and `reorderProjectGroups` write **only** `sort_order`, never `sort_key` (sqlite-repository.ts:280, :290). T7 switches `getProjects`/`getProjectGroups` to `ORDER BY sort_key`. Converting the read without the write makes dragging a project in the sidebar a no-op that leaves no trace: it compiles, the suite passes, and it breaks in the user's hands.
Ruling: T7 converts all three reorder methods to the fractional `move*` shape, not just tasks. Added the two regression tests that would have caught it, and listed the extra files the change reaches — `src/db/repository.ts` (interface), `src/test-harness/MemoryRepository.ts` (second implementation), `Sidebar.tsx` (three call sites), `store/projects.ts`, `store/projectGroups.ts`. Cost if wrong: T7 is now the largest task in the plan and may warrant splitting during execution.

**F2 — T8's test used an input field that does not exist.**
It called `repo.createProject({ name: "p", groupId: group.id })`, but `CreateProjectInput` carries only `name`, `color`, `icon` (types/index.ts:76). Attachment is a separate method, `assignProjectToGroup(projectId, groupId)` (sqlite-repository.ts:300).
Ruling: corrected pre-dispatch in all three affected tests. Cost if wrong: none — verified against the type and the method.

**F3 — three tasks depend on harness capabilities that do not exist.**
`BetterSqliteDriver` exposes only `execute`, `select` and `close`. T2 needs `reopen()`, T7 needs `countWrites()`, T8 and T9 need `failNextExecuteMatching()`. The draft mentioned two of them as asides inside later tasks and never mentioned the third.
Ruling: folded all three into T1 as an explicit step, since T1 already opens that file. Better one deliberate extension than three tasks each improvising. Cost if wrong: T1 grows by one step.

**Ruling (T5, behaviour change worth surfacing) — a new task will now go to the top.**
The plan pins that a freshly created task sorts first. The optimistic store already prepends it (`store/tasks.ts`), but the persisted order disagrees: `sort_order = 0` for every new task with `ORDER BY sort_order, created_at` puts the newest *last* among its ties. So T5 does not preserve current observable behaviour — it corrects a disagreement between the optimistic view and the reloaded view, in the direction the original `sort_order = 0` intended. Surfaced to the user before execution. Cost if wrong: users who had adapted to the reload behaviour see new tasks move.

Preflight complete. All rows ruled. Dispatching Task 1.

## Progress
Task 1: review — spec ✅, quality NEEDS FIXES. 2 Important: (a) countWrites() counts BEGIN/COMMIT/ROLLBACK because transaction() drives them through the counted execute() path, so Task 7's "writes one row, not N" assertion would observe 3 and invite a fix to the expected number rather than the counter; (b) reopen()'s Object.create + hand-listed field copy silently misses any field added to the constructor later. 2 Minor: rollback can mask the original error; nested transaction unguarded.
Task 1: Ruling: fixing both Importants plus the rollback-masking Minor. The two Importants are in the test harness, which eight later tasks build on — a miscounting instrument is worse than no instrument, because it produces a confident wrong number. The rollback Minor is included because it is one line and it is *my* defect: the brief's snippet discarded the original error, and the implementer transcribed it faithfully. Leaving nested-transaction guarding out: nothing in this plan nests, and a speculative guard is the kind of unused machinery the plan is meant to avoid. Cost if wrong: a later plan that nests transactions gets a generic SQLite error instead of a named one.
Task 1: Ruling: the reviewer judged the Step 8 evidence honestly characterised rather than oversold — the code comment says "probe standing in for" and does not claim a live-app observation. Accepting it as the best available evidence; the residual is that the real IPC round trip remains unverified.
Task 1: fix round 1/5 (3 addressed, 0 open — `raw()` bypasses both the write counter and the failure injection, Object.create gone in favour of constructor overloads, original error preserved in both implementations; commits 46420c2..a71752e). Two new tests confirmed as genuine discriminators, verified by reverting the fix.
Task 1: complete (commits 57e49f5..a71752e, review clean). pnpm test:run 441 passed / 44 files, lint and build clean.
Task 1: residual (accepted): a failing ROLLBACK is swallowed rather than surfaced alongside the original error. `Error.cause` would carry both but needs an ES2022 lib and tsconfig targets ES2020; bumping it was out of scope. Revisit if a rollback ever fails in the field.
Task 1: residual (accepted): the isIgnorable confirmation came from a same-version sqlx-sqlite probe, not the compiled Bunly binary's IPC round trip. The code comment says "probe standing in for" and does not overstate it.
Task 2: implementer corrected two defects in my brief. (a) My test snippets called `runMigrations(db)` with one argument; the real signature takes ALL_MIGRATIONS second, as every other call site does. (b) More substantive: my rerun test assumed a second runMigrations call replays migration 010, but the runner is version-gated on user_version and never replays an applied migration — its own tested contract. It fixed the test by resetting user_version first, the idiom already used in that file.
Task 2: Ruling: accepting the consequence it surfaced rather than redesigning the laundering. Migration 010 fires once and cannot re-fire, so any "local" stamp written *after* the upgrade is never cleaned. That window exists only between commits on this branch — Tasks 2 and 3 ship in the same release, and Task 3 removes the call sites that write "local". The residual real case is a user who upgrades, rolls back to an older build, writes more stamps, then upgrades again: 010 will not re-fire for them. Judged not worth converting the migration into a boot-time laundering pass, which would run on every launch forever to cover a rollback-then-forward sequence. Cost if wrong: that user keeps some authorless stamps, which lose ties rather than corrupt data. **Constraint this creates: Task 3 must not be split into a separate release from Task 2.** Recorded in the plan.
Task 2: review — spec ✅, quality approved, 0 Critical, 1 Important (disclosure, not correctness).
Task 2: Ruling: the reviewer found that blanking `"d"` to `""` makes legacy stamps permanent tie-*losers*, not tie-neutral — an empty string sorts below every UUID, so a legacy field tying on timestamp against any attributed write loses deterministically until a real device touches it. I confirm that is the intended behaviour: preferring a fresh attributed write over one whose author is unknowable is the safer default, and exact-millisecond ties between devices are rare. The defect is purely that nobody named it — not my brief, not the migration comment, not the self-review. Dispatched a comment-only fix round. Escalated above "deferred minor" deliberately: a comment that states a decision without its consequence is how a wrong belief propagates, which is precisely the cause of the login-throttler bug fixed in the sibling repo earlier today. Cost if wrong: none, the change is documentation.

---

## HANDOFF — read this first if you are resuming

**Where things stand.** Tasks 1 and 2 are done and reviewed. Task 2's comment-only fix round was dispatched and may or may not have landed — check `git log` on `feat/sync-prerequisites` for a commit after `0020ade`, and check the tail of `task-2-report.md` for a fix-round section. If it landed, run one scoped re-review over that commit and then mark Task 2 complete. If it did not, re-dispatch the fix described in the ruling immediately above.

**Then continue at Task 3.** Tasks 3 through 10 have not been started. The plan is `docs/superpowers/plans/2026-08-23-sync-prerequisites.md`, already corrected against four preflight findings — do not re-derive them, they are in the scan table at the top of this ledger.

**Carry these forward into the dispatches:**
- Task 3 removes the `LOCAL_DEVICE_ID` call sites. It **must ship in the same release as Task 2** — see the "Contrainte de livraison" section at the end of the plan for why.
- Task 3 introduces `_stamp(table, id, fields, now)` and `_keyOf(table, id)`, which Tasks 4, 5, 7, 8 and 9 all consume. Get their shapes right there; a later rename is expensive.
- Task 7 is the largest and riskiest. It converts all three reorder methods, not just tasks, and it reaches `src/db/repository.ts`, `src/test-harness/MemoryRepository.ts`, `Sidebar.tsx` (three call sites), `store/projects.ts` and `store/projectGroups.ts`. Converting the read without the write would break the sidebar reorder silently. Consider splitting it during execution.
- Task 5 changes observable behaviour: a new task will sort to the top. Already surfaced to the user; do not re-ask.

**Working conventions in force.** Work in place on `feat/sync-prerequisites` in the main checkout — no worktree, for the reason in the header. Baseline as of Task 2: 447 tests across 45 files, lint and build clean. Every task ends with `pnpm test:run`, `pnpm lint`, `pnpm build` green.

--- appended after the handoff was first written ---

Task 2: fix round 1/5 (1 addressed, 0 open — comment-only, commit 4b772f6, 447 tests unchanged).
Task 2: the implementer escalated a spec ambiguity rather than assuming past it, and it was load-bearing: **§5 said "comparaison lexicographique" without ever fixing the direction.** Both directions converge, which is all a tie-break strictly requires, so the ambiguity was invisible until a specific value mattered. It matters now: `""` sorts below every UUID, so under greater-wins the laundered legacy stamps lose ties (intended), and under smaller-wins they would win every one (the exact opposite).
Task 2: Ruling: pinned §5 to **greater device_id wins**, in the spec, with the reasoning. This is binding on the plan-4c merge engine, not cosmetic — an implementer picking the other direction would silently turn authorless legacy stamps into permanent tie-winners. Amended in commit on this branch. Cost if wrong: the direction is arbitrary between two converging options, so the only cost of choosing wrongly is that the legacy-stamp preference inverts, which is why it had to be written down rather than left to whoever writes 4c.
Task 2: complete (commits a71752e..4b772f6, review clean — spec ✅, quality approved). 447 tests / 45 files, lint and build clean.

**Resume at Task 3.** The handoff section above is current; the only change is that Task 2's fix round has now landed and Task 2 is closed. One scoped re-review of 4b772f6 was not run — it is comment-only and the diff is a SQL comment, so the next session may either run one for completeness or accept it and move on.

Task 3: implemented at b6c2bd5 (454 tests / 45 files). Implementer raised four concerns, none hidden. Fix round 1 dispatched on three of them.
Task 3: Ruling: my brief's `moveTasksToProject` test was a false positive — it passes without the fix, because `createTask` already stamps `project_id`. Directed a rewrite that asserts the stamp *timestamp changed*, and asked the implementer to audit the other six tests for the same weakness rather than only the one it spotted. A test that passes pre-fix is worse than no test: it reports coverage that does not exist.
Task 3: Ruling: wrap each column-write + stamp pair in a transaction. The implementer correctly flagged that the two statements are unwrapped and that a crash between them leaves a row column-changed but unstamped — invisible to the merge engine, so the change never propagates, which is the exact failure this task exists to prevent. Task 1 built `DbDriver.transaction` for precisely this; not using it here would have left the tool unused at its first opportunity.
Task 3: Ruling: `_keyOf` moves to Task 7. My preflight ruling placed it in Task 3 for symmetry with `_stamp` without checking it had a caller, which forced a `@ts-expect-error` suppression to survive four tasks under `noUnusedLocals`. Introducing a helper where it is first used is better than suppressing an error about its absence. Cost if wrong: Task 7 grows by one small method.
Task 3: accepted without change — the 2 ms delay added to make `unarchiveTask` deterministic. It exposes a real design property worth recording: two writes from the *same* device in the same millisecond are unresolvable by the §5 tie-break, since both the timestamp and the device id are identical. Not fixable here; relevant to plan 4c.

**HANDOFF UPDATE — supersedes the "Resume at Task 3" line above.**
Tasks 1 and 2 are closed. Task 3 is implemented (b6c2bd5) and **mid-fix-round-1**: three findings dispatched (false-positive test, missing transaction wrap, `_keyOf` suppression). If resuming, check `git log` for a commit after b6c2bd5 and the tail of `task-3-report.md` for a fix-round section. If it landed, run one scoped re-review over that range, then close Task 3 and continue at Task 4. If not, re-dispatch the three fixes from the rulings above.
Task 4 onward is untouched. Task 7 must now also introduce `_keyOf` (moved out of Task 3) — do not forget it, `moveTask` cannot work without it.
Task 3: fix round 1/5 (3 addressed, 0 open — commits b6c2bd5..78de45c). The implementer audited all seven tests rather than only the one I flagged and found **three** false positives (moveTasksToProject, uncompleteTask, and deleteTask's title assertion), then verified the whole set empirically by stripping every _stamp call and confirming 8/8 fail.
Task 3: complete (commits 7081787..78de45c, review clean — spec ✅, quality approved, 0 Critical/Important). 455 tests / 45 files, lint clean with zero warnings, build clean. Reviewer independently verified each of the 8 tests as a genuine discriminator, per test rather than in aggregate, and confirmed all six sites use the transaction's `tx` rather than the outer driver.
Task 3: minor (noted, no action): archiveTask/completeTask/device-id tests still assert bare presence, which is correct today because createTask never stamps deleted_at or completed_at. Re-check if createTask's stamped-field list ever grows to include them.

## HANDOFF — CURRENT AS OF END OF SESSION

**Done and closed:** Tasks 1, 2, 3. Branch `feat/sync-prerequisites`, 12 commits, nothing pushed.
**State:** 455 tests / 45 files, lint clean (zero warnings), build clean. Working tree clean apart from the untracked `src/lib/usagi.code-workspace` that predates this work.
**Resume at Task 4.** Nothing is in flight.

Carry forward:
- **Task 7 must introduce `_keyOf(table, id)`** — moved out of Task 3 because it had no caller there. `moveTask` cannot work without it.
- **Task 7 is the largest and riskiest.** It converts all three reorder methods, not just tasks, and reaches src/db/repository.ts, src/test-harness/MemoryRepository.ts, Sidebar.tsx (three call sites), store/projects.ts and store/projectGroups.ts. Converting reads without writes breaks the sidebar reorder silently. Consider splitting.
- **Tasks 2 and 3 must ship in the same release** — see "Contrainte de livraison" at the end of the plan.
- **Task 5 changes observable behaviour** (a new task sorts to the top). Already surfaced to the user; do not re-ask.
- **Audit every test the plan hands you for false positives before accepting it.** Three of my Task 3 tests passed without the fix. The reliable method, used by the Task 3 implementer: strip the production change, confirm the tests fail, restore.

Task 4: implemented at 37edab0 — 464 tests / 45 files, lint and build clean. **NOT REVIEWED.** The session ran out of context before the review could be dispatched. This is the only unreviewed commit on the branch.
Task 4: OPEN FINDING, must be resolved — **`assignProjectToGroup` (sqlite-repository.ts) writes `group_id`, an LWW-governed column, and does not stamp it.** It fell outside the method inventory my brief's grep defined, so the implementer flagged it rather than silently widening scope, which was the right call. It is the same defect class this whole task exists to close: an unstamped `group_id` means a merge engine sees no change, and re-parenting a project silently reverts when another device pushes its stale copy. Route it into Task 8 (which already stamps `group_id` when detaching projects from a deleted group) or fix it in Task 4's review round. Do not let it reach Task 7.
Task 4: my brief's worked example for `updateProject` was another false positive — a presence-check masked by `createProject` already stamping `color`. The implementer rewrote it to change-detection and verified it fails pre-fix. That is the **fourth** such test of mine on this plan. The pattern is now unambiguous: presence-checks are only genuine for columns that creation never writes.
Task 4: `deleteProjectGroup` correctly left untouched — it is still a hard DELETE, so no column survives to stamp. Task 8 converts it to a tombstone.

## HANDOFF — FINAL, CURRENT AS OF END OF SESSION

**Branch `feat/sync-prerequisites`, 12 commits, nothing pushed. Working tree clean apart from the pre-existing untracked `src/lib/usagi.code-workspace`.**
**464 tests / 45 files, lint clean, build clean.**

Tasks 1, 2, 3: complete and reviewed.
Task 4: implemented, **review owed**. Start there.

Do this first, in order:
1. Package and dispatch the Task 4 review (`scripts/review-package <plan> 78de45c 37edab0`). Point it at the open `assignProjectToGroup` finding above and at the per-test discriminator claims in `task-4-report.md`.
2. Resolve the `assignProjectToGroup` gap.
3. Continue at Task 5.

Standing constraints, all recorded in the plan or the spec so they survive this file:
- **Task 7 must introduce `_keyOf(table, id)`** — moved out of Task 3. `moveTask` cannot work without it.
- **Task 7 converts all three reorder methods**, not just tasks, and reaches repository.ts, MemoryRepository.ts, Sidebar.tsx (3 call sites), store/projects.ts, store/projectGroups.ts. Reads without writes breaks the sidebar reorder silently.
- **Tasks 2 and 3 ship in the same release** — plan, "Contrainte de livraison".
- **Task 5 changes observable behaviour** (new tasks sort to the top). Already agreed with the user.
- **LWW tie-break is greater-device-id-wins** — pinned in spec §5 today; binding on plan 4c.
- **Audit every test the plan hands you.** Four of my briefs' tests passed without their fix. Method: strip the production change, confirm failure, restore. Presence-checks are genuine only for columns creation never writes.
Task 5: implemented at 000971a — 471 tests / 45 files, lint and build clean. NOT REVIEWED (user took review to the end of the plan). `_headKey(table)` added; the three create* methods write and stamp sort_key; **the open `assignProjectToGroup` finding is closed** — it now stamps group_id inside a transaction. Every new/touched assertion strip-tested (revert production change, confirm red, restore).
Task 6: implemented at c4ab596 — 476 tests / 45 files, lint and build clean. NOT REVIEWED. Migration 011 added and registered; backfill now wraps all three tables in one transaction. Implementer found my duplicate/idempotence tests do not alone catch the anchor-after-max collision and added an explicit regression for it. All tests strip-verified.
Task 7: implemented at 1519aad — 483 tests / 45 files, lint and build clean. NOT REVIEWED. All three reorder methods converted to move*; _keyOf introduced; reads switched to sort_key (5 sites); sort_order no longer written; old reorder* gone from repository.ts and sqlite-repository.ts. Verified independently by me: 3 move* methods present, no reorder* remaining, build clean. Implementer caught two self-passing tests during falsification — including my two sidebar-reorder regressions, which moved a row already in creation order — and fixed both before committing.
Task 8: implemented at 59f9c3e — 489 tests / 45 files, lint and build clean. NOT REVIEWED. deleteProjectGroup now tombstones and detaches its projects atomically; getProjectGroups filters purged_at IS NULL.
Task 8: **my atomicity test would have passed without the transaction.** The write order I specified (detach then tombstone) made the fail-injection abort before any write landed, so unwrapped-sequential and atomic were indistinguishable. The implementer reordered production code to tombstone first, detach second, giving the failure something real to roll back — then verified the test fails with the wrapper removed. It also caught two further self-passing tests (a stamp-presence-only check, and one true for an empty list even under the old DELETE). Fifth, sixth and seventh false-positive tests originating in my briefs.
Task 9: implemented at 5d8d3c4 — 497 tests / 45 files, lint and build clean. NOT REVIEWED. bulkImport now wrapped in a transaction, stamps every row it writes, and tombstones (rather than deletes) local rows absent from a replace payload, guarded by WHERE purged_at IS NULL. Implementer caught another self-passing test (Map.get on a physically deleted row returns undefined, which satisfies not.toBeNull) and hit the same atomicity trap as Task 8 — before/after both empty without a seeded pre-existing row. Honestly flagged that the "resurrects a tombstoned task" test is a pin, not a discriminator, since purged_at was never in the insert column list either way.
Task 10: implemented at abe0450 — 503 tests / 46 files, lint and build clean. NOT REVIEWED. Import warning + confirmation dialog, changelog entry added. `pnpm run doctor` ran (63/100); all 13 findings sit in files this plan never touched, left alone.

## PLAN COMPLETE — ALL 10 TASKS IMPLEMENTED, 7 UNREVIEWED

Branch `feat/sync-prerequisites`, nothing pushed. Verified independently by me at the end: **503 tests / 46 files, lint clean, build clean.**

Reviewed and closed: Tasks 1, 2, 3.
**Implemented but never reviewed: Tasks 4, 5, 6, 7, 8, 9, 10.** The user chose to take the review at the end rather than per task.

**Strongly recommended before merge: one whole-branch review over `develop..HEAD`.** It sees what per-task reviews structurally cannot — properties that only emerge across the branch. On the previous plan that is exactly what found two crypto crates compiled without their `zeroize` feature, which ten per-task reviews had all missed because none of them looked at the resolved dependency tree.

Point that review at:
- **Task 7 above all** — it converted all three reorder methods and flipped every ordering read from `sort_order` to `sort_key`. The dangerous failure is silent: converting reads without writes makes the sidebar reorder a no-op that leaves no trace.
- **`sort_order` is now written by nothing and read by nothing.** Confirm no path still depends on it. It stays in the schema deliberately — dropping it needs a table rebuild, and §9.6 warns a rebuild drops triggers and sync columns.
- **The false-positive pattern.** Across this plan, **eight** tests originating in my briefs passed without the change they were meant to verify. Implementers caught them from Task 3 onward using strip-and-confirm, but Tasks 4-10 were never independently reviewed, so treat every assertion in them as unverified until checked. Presence-checks are genuine only for columns that creation never writes.

Standing constraints, recorded in the plan and spec so they outlive this file: Tasks 2+3 ship together; LWW tie-break is greater-device-id-wins (spec §5); a new task now sorts to the top (agreed with the user).

## WHOLE-BRANCH REVIEW OF TASKS 4-10 — VERDICT: NOT READY TO MERGE

Reviewer sampled 61 tests for the self-passing pattern and could not break the hardened ones; confirmed all 20 `_stamp` sites pass `tx`, both migrations registered and ordered, and nothing assumes a replay. Six of seven tasks solid. Three defects must be fixed.

**CRITICAL 1 — sidebar project reordering is a permanent silent no-op.** `Sidebar.tsx:573-592` re-sorts the repository's result by `a.sortOrder - b.sortOrder`, a column this branch made dead. `moveProject` writes only `sort_key`. Simulated: a user with legacy sort_order 0..4 drags E to the top; the repo returns E,A,B,C,D; the memo re-sorts to A,B,C,D,E. **The drag snaps back on the spot and every later drag does too.** This is Task 7's stated danger surviving one layer above where the plan's callout looked. Masked twice over: every component fixture uses `sortOrder: 0` so the sort is a no-op, and `MemoryRepository.move*` still renumbers sortOrder 0..N-1, faithfully preserving the OLD contract so any test through the double sees a working reorder.
  Same root cause: `Sidebar.tsx:839,862` build the ids fed to `computeReorderedIds` by sorting on sortOrder, so prevId/nextId anchor between the wrong neighbours even once rendering is fixed. `createProjectGroup` still does MAX(sort_order)+1 while `_headKey` puts its key at the top — a new group is first from the repo and last in the sidebar. `ProjectFilter.tsx:57` and `DayDetailPanel.tsx:187-188` read the same dead column.
  Also surfaced: `projects.sort_key` and `project_groups.sort_key` are independent key spaces and are not comparable, so group/project interleaving in the merged top-level list now has **no ordering source at all**. `moveProjectGroup` is dead — no UI caller.
  Fix: consume repository order directly; make MemoryRepository model insertion order so the double stops masking; add a test asserting **rendered** sidebar order after a moveProject with distinct legacy sortOrder values.

**IMPORTANT 2 — bulkImport reverses the order of every imported list.** `_headKey` is called inside the per-row loop (`:947`, `:992`), so each row lands above the previous. Verified against fractional-indexing: T1..T4 import as a0,Zz,Zy,Zx and sort back as T4,T3,T2,T1. Export reads display order, so export-then-import inverts the user's entire task and project lists. Fix: one `generateNKeysBetween` outside the loop; also removes an N+1 SELECT MIN per row.

**IMPORTANT 3 — bulkImport writes completed_at/deleted_at/purged_at/group_id without stamping, and discards prior stamps.** `stampFields` is called with `existing = null` (`:1009`). An import that un-completes or un-archives a task leaves those columns unstamped, so they lose to any remote value and silently revert on first sync — the exact §1.2 failure this plan exists to close, reintroduced in the one method Task 9 was meant to bring under the contract. `group_id` is absent from the projects column list, so a merge silently ungroups every colliding project.

IMPORTANT 4 — the merge-mode dialog copy never mentions other devices, and `ImportConfirmDialog.test.tsx:70` pins that omission. But merge propagates too: §9.4's worked scenario is a *merge* collision resurrecting a tombstone on device B. Fix the copy and invert the test.
IMPORTANT 5 — `does not import until the user confirms` cannot fail; it clicks a mode toggle and asserts a prop wasn't called. The real gate is in `SettingsDialog.tsx:960-993`, untouched and untested. Coverage gap, not a defect.
Minors 6-10: `_headKey`/`_keyOf` read through `this.db` not `tx`; `_tombstoneAbsent` binds one variable per kept id (breaks past ~16k tasks); key derivation reads outside the writing transaction; two characterization tests miscounted as coverage.

**For plan 4c, not this branch:** spec §5.2 makes purge terminal, so the settled "restoring an old backup resurrects data everywhere" behaviour resurrects locally but cannot propagate — the remote purge wins. Reconcile in the merge-engine plan.

**Next session: fix Critical 1, Important 2 and 3, then re-review.** Nothing is pushed.

## RE-REVIEW + SECOND FIX WAVE

Re-review verdict: all 5 original findings ADDRESSED, both masks fell, the rendered-order test is a genuine discriminator (reviewer re-derived the key arithmetic by hand), the shared key space verified by executing the backfill SQL against a migrated database (returns g0,p0,g1,p1,p2 — interleaved). Falsification table judged trustworthy after sampling 7 of 11 rows.
**But the fix wave introduced a Critical of its own:** adding `group_id` to bulkImport's column list made restore fail outright with FOREIGN KEY constraint failed on any device lacking the group, rolled back the whole transaction, and reported "invalid or corrupted file" for a valid backup. It traded a silent wrong value for total failure of the export feature's primary use.
Fixed at 8a4e420 (null the group_id when the group is absent locally, stamped so the ungrouping propagates) and 86ec4e9 (the missing discriminating test for the single-pass backfill). 517 tests / 46 files, lint and build clean, verified by me.

**OPEN — not fixed, needs a decision.** The same FK failure exists for `tasks.project_id` and `tags.project_id`, and it is UI-reachable: `dataTransfer.ts:52-53` exports `projects: []` when the projects checkbox is unchecked while still exporting tasks carrying `projectId`. That backup cannot be restored anywhere those projects are absent. The fixer confirmed it by probe and deliberately did **not** apply fix 1's pattern, because nulling `project_id` would dump every task into the Inbox — far worse data loss than ungrouping. Needs its own answer.
**OPEN — deliberate.** `ExportData` still has no `projectGroups` array. The crash is gone but a fresh-install restore still silently ungroups. Fixing it changes the on-disk export format and needs a versioning decision.
**Deferred, non-blocking:** changelog entry for "new items appear at the top"; `Sidebar.tsx:602` comparator never returns 0 (matters only in the NULL-key window before the backfill runs); `DayDetailPanel` findIndex inside a sort comparator; `sortOrder` field removal; MemoryRepository fidelity gaps.
