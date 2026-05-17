import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { groupTasksByDate } from "./calendarUtils";

const base: Task = {
	id: "t1",
	title: "Test",
	description: null,
	projectId: null,
	priority: "none",
	dueDate: null,
	completedAt: null,
	deletedAt: null,
	tags: [],
	sortOrder: 0,
	createdAt: "2026-05-01T10:00:00.000Z",
	updatedAt: "2026-05-01T10:00:00.000Z",
};

describe("groupTasksByDate", () => {
	it("pending task with dueDate appears in due on its date", () => {
		const task = { ...base, dueDate: "2026-05-17" };
		const map = groupTasksByDate([task]);
		expect(map.get("2026-05-17")?.due).toContain(task);
		expect(map.get("2026-05-17")?.completed).toHaveLength(0);
	});

	it("completed task appears in completed on completedAt date", () => {
		const task = {
			...base,
			dueDate: "2026-05-10",
			completedAt: "2026-05-17T14:30:00.000Z",
		};
		const map = groupTasksByDate([task]);
		expect(map.get("2026-05-17")?.completed).toContain(task);
		expect(map.get("2026-05-10")).toBeUndefined();
	});

	it("completed task is absent from due even if it has a dueDate", () => {
		const task = {
			...base,
			dueDate: "2026-05-10",
			completedAt: "2026-05-17T14:30:00.000Z",
		};
		const map = groupTasksByDate([task]);
		expect(map.get("2026-05-10")).toBeUndefined();
	});

	it("pending task without dueDate is absent from the map", () => {
		const task = { ...base, dueDate: null, completedAt: null };
		const map = groupTasksByDate([task]);
		expect(map.size).toBe(0);
	});

	it("multiple tasks on the same day are all present", () => {
		const t1 = { ...base, id: "t1", dueDate: "2026-05-17" };
		const t2 = { ...base, id: "t2", dueDate: "2026-05-17" };
		const map = groupTasksByDate([t1, t2]);
		expect(map.get("2026-05-17")?.due).toHaveLength(2);
	});

	it("completedAt with time extracts only the date part", () => {
		const task = { ...base, completedAt: "2026-05-17T23:59:59.000Z" };
		const map = groupTasksByDate([task]);
		expect(map.has("2026-05-17")).toBe(true);
	});

	it("returns empty map for empty array", () => {
		expect(groupTasksByDate([])).toEqual(new Map());
	});
});
