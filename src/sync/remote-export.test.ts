import { describe, expect, it } from "vitest";
import { remoteToExportData } from "./remote-export";
import type { RemoteRecord } from "./types";

const payload = (fields: Record<string, unknown>) => ({
	_v: 1 as const,
	created_at: "2026-09-01T10:00:00.000Z",
	_fields: {},
	...fields,
});

describe("remoteToExportData", () => {
	it("turns decrypted server records into the import format", () => {
		const records: RemoteRecord[] = [
			{
				entityType: "project",
				id: "p1",
				payload: payload({
					name: "Work",
					color: "#f00",
					icon: null,
					group_id: null,
					sort_key: "a0",
				}),
			},
			{
				entityType: "tag",
				id: "t1",
				payload: payload({ name: "urgent", color: null, project_id: null }),
			},
			{
				entityType: "task",
				id: "k1",
				payload: payload({
					title: "Ship it",
					description: null,
					project_id: "p1",
					priority: "high",
					due_date: "2026-10-01",
					tags: ["t1", "gone"],
					completed_at: null,
					deleted_at: null,
				}),
			},
			{
				entityType: "project_group",
				id: "g1",
				payload: payload({ name: "Group", color: null, sort_key: "a1" }),
			},
		];

		const data = remoteToExportData(records, "2026-09-29T20:00:00.000Z");

		expect(data.version).toBe(1);
		expect(data.exportedAt).toBe("2026-09-29T20:00:00.000Z");
		expect(data.projects).toEqual([
			{
				id: "p1",
				name: "Work",
				color: "#f00",
				icon: null,
				sortOrder: 0,
				sortKey: "a0",
				groupId: null,
				createdAt: "2026-09-01T10:00:00.000Z",
				updatedAt: "2026-09-01T10:00:00.000Z",
			},
		]);
		expect(data.tags).toEqual([
			{ id: "t1", name: "urgent", color: null, projectId: null },
		]);
		// A tag id with no matching tag record is dropped, not invented.
		expect(data.tasks).toEqual([
			{
				id: "k1",
				title: "Ship it",
				description: null,
				projectId: "p1",
				priority: "high",
				dueDate: "2026-10-01",
				completedAt: null,
				deletedAt: null,
				tags: [{ id: "t1", name: "urgent", color: null, projectId: null }],
				sortOrder: 0,
				createdAt: "2026-09-01T10:00:00.000Z",
				updatedAt: "2026-09-01T10:00:00.000Z",
			},
		]);
	});
});
