import { create } from "zustand";
import type { TaskFilters } from "@/types";

interface UIStore {
	sidebarCollapsed: boolean;
	selectedProjectId: string | null | undefined; // null = Inbox, undefined = all tasks
	selectedTaskId: string | null;
	activeFilters: TaskFilters;
	setSidebarCollapsed(v: boolean): void;
	setSelectedProject(id: string | null | undefined): void;
	setSelectedTask(id: string | null): void;
	navigateToTask(projectId: string | null, taskId: string): void;
	setFilters(filters: Partial<TaskFilters>): void;
}

export const useUIStore = create<UIStore>((set) => ({
	sidebarCollapsed: false,
	selectedProjectId: undefined, // special sentinels: null=Inbox, "today"=Today, "tags"=TagManager, "calendar"=CalendarView, undefined=All
	selectedTaskId: null,
	activeFilters: {},

	setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
	setSelectedProject: (id) =>
		set({ selectedProjectId: id, selectedTaskId: null, activeFilters: {} }),
	setSelectedTask: (id) => set({ selectedTaskId: id }),
	navigateToTask: (projectId, taskId) =>
		set({ selectedProjectId: projectId, selectedTaskId: taskId, activeFilters: {} }),
	setFilters: (filters) =>
		set((s) => ({ activeFilters: { ...s.activeFilters, ...filters } })),
}));
