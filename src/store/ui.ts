import { create } from "zustand";
import type { TaskFilters } from "@/types";

interface UIStore {
	sidebarCollapsed: boolean;
	selectedProjectId: string | null | undefined; // null = Inbox, undefined = all tasks
	selectedTaskId: string | null;
	activeFilters: TaskFilters;
	collapsedGroupIds: Set<string>;
	/** Lifted here (rather than local state in SettingsDialog) so the sync
	 * status banner in AppShell can open Settings without owning it. */
	settingsOpen: boolean;
	setSidebarCollapsed(v: boolean): void;
	setSelectedProject(id: string | null | undefined): void;
	setSelectedTask(id: string | null): void;
	navigateToTask(projectId: string | null, taskId: string): void;
	setFilters(filters: Partial<TaskFilters>): void;
	toggleGroupCollapsed(id: string): void;
	openSettings(): void;
	setSettingsOpen(open: boolean): void;
}

export const useUIStore = create<UIStore>((set) => ({
	sidebarCollapsed: false,
	selectedProjectId: undefined, // special sentinels: null=Inbox, "today"=Today, "tags"=TagManager, "calendar"=CalendarView, undefined=All
	selectedTaskId: null,
	activeFilters: {},
	collapsedGroupIds: new Set<string>(),
	settingsOpen: false,

	setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
	setSelectedProject: (id) =>
		set({ selectedProjectId: id, selectedTaskId: null, activeFilters: {} }),
	setSelectedTask: (id) => set({ selectedTaskId: id }),
	navigateToTask: (projectId, taskId) =>
		set({
			selectedProjectId: projectId,
			selectedTaskId: taskId,
			activeFilters: {},
		}),
	setFilters: (filters) =>
		set((s) => ({ activeFilters: { ...s.activeFilters, ...filters } })),
	toggleGroupCollapsed: (id) =>
		set((s) => {
			const next = new Set(s.collapsedGroupIds);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return { collapsedGroupIds: next };
		}),
	openSettings: () => set({ settingsOpen: true }),
	setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
