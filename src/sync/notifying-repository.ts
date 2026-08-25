import type { TodoRepository } from "@/db/repository";

/**
 * The engine OBSERVES the repository (spec §1): the UI keeps its writes local
 * and synchronous, and this decorator fires the §4.2 debounce after each one.
 * A read allowlist rather than a write list: a repository method added
 * tomorrow defaults to "notifies", which costs at worst a redundant sync —
 * the safe direction.
 */
const READ_ONLY_METHODS = new Set<string>([
	"getTasks",
	"getTask",
	"getArchivedTasks",
	"getProjects",
	"getProjectGroups",
	"getTags",
	"getSettings",
	"isTagUsedInProjectTasks",
	"previewImport",
]);

export function withWriteNotifications(
	repo: TodoRepository,
	onWrite: () => void,
): TodoRepository {
	return new Proxy(repo, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver) as unknown;
			if (typeof value !== "function") return value;
			const method = value.bind(target) as (...args: unknown[]) => unknown;
			if (READ_ONLY_METHODS.has(String(prop))) return method;
			return async (...args: unknown[]) => {
				const out = await method(...args);
				onWrite();
				return out;
			};
		},
	}) as TodoRepository;
}
