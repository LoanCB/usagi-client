# React Doctor — confirmed false positives

Findings the `/doctor` triage loop should drop. Each entry was verified by
reading the code in question (not suppressed on filename alone). Format:

`<rule> — <file / code shape> — <why it's a false positive>`

If a file is refactored such that one of these no longer applies, remove the
entry so the rule can fire again.

## Security

- `plugin-update-trust-risk` — `.github/workflows/release.yml` — The flagged
  step packages locally-built release artifacts and signs them with
  `pnpm tauri signer sign`. Nothing is downloaded or executed across a trust
  boundary; the words "installer"/"updater" sitting near a `.exe` reference trip
  the heuristic. Signing IS the integrity mechanism here.

## Performance

- `async-await-in-loop` — `src/App.tsx` (DB migration loop) — SQL migrations
  must run in order (CREATE before ALTER) and SQLite locks under concurrent
  writes. Sequential is required for correctness; the loop is idempotent and
  runs once at startup.

- `async-await-in-loop` — `src/components/layout/ProjectGroupNavItem.tsx`
  (`handleDissolve`) — Each `assignToGroup` reads/updates cumulative Zustand
  store state and conditionally deletes the now-empty source group. Running the
  iterations with `Promise.all` would race the empty-group cleanup.

- `async-parallel` — `src/components/projects/CreateGroupDialog.tsx`
  (`handleConfirm`) — Same cause as above: the two `assignToGroup` calls share
  cumulative store state with a conditional "delete now-empty old group" side
  effect, so ordering matters. (`createGroup` must also precede both.)

## State & Effects

- `no-event-handler` — `src/components/tasks/RichTextEditor.tsx` — The
  `onChangeRef`/`onBlurRef` "latest ref" effects and the value→editor sync are
  the deliberate, correct way to integrate the imperative TipTap editor without
  re-creating it on every render. Not a faked event handler.

- `no-event-handler` — `src/components/ui/calendar.tsx` (`CalendarDayButton`) —
  Vendored shadcn/ui code; focuses the day button in response to
  react-day-picker's external `modifiers.focused` state, which the handler
  cannot observe directly (the rule's own FP carve-out for external state).

- `no-event-handler` — `src/components/tasks/QuickAddTask.tsx` — The parent
  bumps an incrementing `focusTrigger` prop to mean "focus now, after the panel
  opens." The effect running *after* render is the intended behavior (the input
  must be mounted first); an imperative ref would fight that timing.

- `no-cascading-set-state` — `src/hooks/useResizable.ts` — The three setters are
  in *separate* `mousemove`/`mouseup` handlers that fire at different times, not
  one synchronous cascade. Combining them into a reducer would not save a render.

- `no-cascading-set-state` — `src/components/layout/SettingsDialog.tsx`
  (`ShortcutInput`) — All three calls are the same `setRecording(false)` in
  mutually-exclusive branches of one keydown handler; only one ever runs.

- `no-derived-useState` — `src/components/layout/TaskDetail.tsx`
  (`TaskDetailContent`) — `title`/`description` are seeded from the `task` prop,
  but the parent renders this component with `key={task.id}`, so it fully
  remounts (and re-seeds) whenever the selected task changes. The value is never
  stale; the rule can't see the parent's `key`.

## Accessibility

- `no-static-element-interactions` — `src/components/layout/ResizeHandle.tsx` —
  Pointer-only resize grip. Already carries a `biome-ignore` with rationale; a
  fully keyboard-accessible separator is a tracked follow-up (needs role
  reconciliation + keyboard-resize wired through `useResizable`).

---

## Not false positives — real but intentionally deferred

These DO fire correctly; left unfixed by choice, not suppressed here. Listed so
the next person knows they were triaged, not missed.

- `prefer-tag-over-role` — `src/components/layout/TaskList.tsx` &
  `src/components/layout/UpdateBanner.tsx` — `<div role="progressbar">` with full
  `aria-value*` attributes. The ARIA is already correct; swapping to native
  `<progress>` would risk a visual regression on the custom-styled bar for a
  marginal semantic gain. Revisit if strict native-tag compliance is wanted.
