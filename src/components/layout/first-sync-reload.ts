import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";

/**
 * The engine applies pulled rows straight to SQLite, and `resolveFirstSync`
 * deletes through `db.transaction` — both bypass the repository, so nothing
 * invalidates the stores the UI renders from. Without a reload the app keeps
 * showing the tasks "Replace" just deleted, and everything a pull brought in
 * stays invisible until the next launch.
 *
 * Projects, groups and tags only: they have no per-view filter, so reloading
 * them centrally is correct. Tasks do not — `TaskList` owns the active view's
 * filters and reloads itself off the same signal. Reloading tasks here would
 * mean reloading them unfiltered and quietly widening whatever the user was
 * looking at.
 *
 * Its own module rather than a callback inside AppShell: the identity stays
 * stable without a hook, and it is directly testable.
 */
export function reloadStoresAfterSync(): void {
	const repo = getRepository();
	void useProjectStore.getState().loadProjects(repo);
	void useProjectGroupStore.getState().loadGroups(repo);
	void useTagStore.getState().loadTags(repo);
}

/**
 * The first-sync dialog's own callback. Same set as above, plus tasks: the
 * dialog resolves before `TaskList` sees a new revision, and "Replace" has just
 * emptied the table, so the list must not keep rendering deleted rows for the
 * length of a sync cycle.
 */
export function reloadStoresAfterFirstSync(): void {
	reloadStoresAfterSync();
	void useTaskStore.getState().loadTasks(getRepository(), {});
}
