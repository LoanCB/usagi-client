import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";

/**
 * §6.4: resolveFirstSync deletes and re-pulls through db.transaction, bypassing
 * the repository, so nothing invalidates the stores. Without this the app keeps
 * rendering the tasks "Replace" just deleted, and everything "Merge" pulled
 * stays invisible until the next launch. Same set and same order as App.tsx's
 * initial load.
 *
 * Its own module rather than a callback inside AppShell: the identity stays
 * stable without a hook, and it is directly testable.
 */
export function reloadStoresAfterFirstSync(): void {
	const repo = getRepository();
	void useProjectStore.getState().loadProjects(repo);
	void useProjectGroupStore.getState().loadGroups(repo);
	void useTagStore.getState().loadTags(repo);
	void useTaskStore.getState().loadTasks(repo, {});
}
