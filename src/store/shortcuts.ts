import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";
import { DEFAULT_SHORTCUTS, type SortShortcut } from "@/lib/shortcuts";

export type ShortcutAction = "sortUrgency" | "sortDueDate" | "sortProject";

interface ShortcutsStore {
	sortUrgency: SortShortcut;
	sortDueDate: SortShortcut;
	sortProject: SortShortcut;
	loadShortcuts(repo: TodoRepository): Promise<void>;
	setShortcut(
		repo: TodoRepository,
		action: ShortcutAction,
		shortcut: SortShortcut,
	): Promise<void>;
	resetShortcuts(repo: TodoRepository): Promise<void>;
}

export const useShortcutsStore = create<ShortcutsStore>((set) => ({
	...DEFAULT_SHORTCUTS,

	async loadShortcuts(repo) {
		const raw = await repo.getSettings();
		if (!raw.sort_shortcuts) return;
		try {
			const parsed = JSON.parse(raw.sort_shortcuts) as {
				urgency?: SortShortcut;
				dueDate?: SortShortcut;
				project?: SortShortcut;
			};
			set({
				sortUrgency: parsed.urgency ?? DEFAULT_SHORTCUTS.sortUrgency,
				sortDueDate: parsed.dueDate ?? DEFAULT_SHORTCUTS.sortDueDate,
				sortProject: parsed.project ?? DEFAULT_SHORTCUTS.sortProject,
			});
		} catch {
			// malformed JSON — keep defaults
		}
	},

	async setShortcut(repo, action, shortcut) {
		set({ [action]: shortcut });
		const s = useShortcutsStore.getState();
		await repo.setSetting(
			"sort_shortcuts",
			JSON.stringify({
				urgency: s.sortUrgency,
				dueDate: s.sortDueDate,
				project: s.sortProject,
			}),
		);
	},

	async resetShortcuts(repo) {
		set({ ...DEFAULT_SHORTCUTS });
		await repo.setSetting(
			"sort_shortcuts",
			JSON.stringify({
				urgency: DEFAULT_SHORTCUTS.sortUrgency,
				dueDate: DEFAULT_SHORTCUTS.sortDueDate,
				project: DEFAULT_SHORTCUTS.sortProject,
			}),
		);
	},
}));
