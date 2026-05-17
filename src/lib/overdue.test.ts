import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { getOverdueTasks } from "./overdue";

const base: Task = {
	id: "t1",
	title: "Task",
	description: null,
	projectId: null,
	priority: "none",
	dueDate: null,
	completedAt: null,
	deletedAt: null,
	tags: [],
	sortOrder: 0,
	createdAt: "2026-04-01T00:00:00.000Z",
	updatedAt: "2026-04-01T00:00:00.000Z",
};

describe("getOverdueTasks", () => {
	it("returns empty array when no tasks", () => {
		expect(getOverdueTasks([])).toEqual([]);
	});

	it("excludes tasks with no dueDate", () => {
		const task: Task = { ...base, dueDate: null };
		expect(getOverdueTasks([task])).toEqual([]);
	});

	it("excludes completed tasks", () => {
		const task: Task = {
			...base,
			dueDate: "2026-04-01",
			completedAt: "2026-04-02T10:00:00.000Z",
		};
		expect(getOverdueTasks([task])).toEqual([]);
	});

	it("excludes tasks due today", () => {
		const today = new Date().toISOString().slice(0, 10);
		const task: Task = { ...base, dueDate: today };
		expect(getOverdueTasks([task])).toEqual([]);
	});

	it("excludes tasks due in the future", () => {
		const task: Task = { ...base, dueDate: "2099-12-31" };
		expect(getOverdueTasks([task])).toEqual([]);
	});

	it("includes incomplete tasks with a past dueDate", () => {
		const task: Task = { ...base, dueDate: "2026-01-01" };
		const result = getOverdueTasks([task]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("t1");
	});

	it("returns only overdue tasks from a mixed list", () => {
		const overdue: Task = { ...base, id: "overdue", dueDate: "2026-01-01" };
		const future: Task = { ...base, id: "future", dueDate: "2099-12-31" };
		const completed: Task = {
			...base,
			id: "done",
			dueDate: "2026-01-01",
			completedAt: "2026-01-02T00:00:00.000Z",
		};
		const noDue: Task = { ...base, id: "nodue", dueDate: null };

		const result = getOverdueTasks([overdue, future, completed, noDue]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("overdue");
	});
});
