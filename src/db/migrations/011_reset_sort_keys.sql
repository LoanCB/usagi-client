-- Discard every sort_key written before the ordering semantics were settled.
--
-- Two independent sources of corruption are already on disk. A subset reorder
-- re-anchored its slice at "a0" and collided with rows it never touched; and a
-- row created after the first backfill was filled in *after* the existing
-- maximum, putting it at the bottom while sort_order = 0 displayed it at the
-- top. The backfill is idempotent, so it never revisited either.
--
-- Nothing reads sort_key yet, so dropping the values costs nothing today. It
-- would cost a rebuild of every user's ordering once the read cutover ships.
UPDATE tasks SET sort_key = NULL;
UPDATE projects SET sort_key = NULL;
UPDATE project_groups SET sort_key = NULL;
