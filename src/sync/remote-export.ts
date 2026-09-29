import type { ExportData } from "@/lib/dataTransfer";
import type { Priority, Project, Tag, Task } from "@/types";
import type { RemoteRecord } from "./types";

const str = (value: unknown): string | null =>
	typeof value === "string" ? value : null;

/**
 * The account backup taken before "keep only this device" erases the server.
 * Same shape as a manual export, so Data › Import restores it. Payloads carry
 * no updated_at nor legacy sort_order: created_at and 0 stand in, which import
 * tolerates. Project groups are left out, as in every export.
 */
export function remoteToExportData(
	records: RemoteRecord[],
	exportedAt: string,
): ExportData {
	const projects: Project[] = [];
	const tags: Tag[] = [];
	const taskRecords: RemoteRecord[] = [];

	for (const record of records) {
		const p = record.payload;
		if (record.entityType === "project") {
			projects.push({
				id: record.id,
				name: str(p.name) ?? "",
				color: str(p.color),
				icon: str(p.icon),
				sortOrder: 0,
				sortKey: str(p.sort_key) ?? "",
				groupId: str(p.group_id),
				createdAt: p.created_at,
				updatedAt: p.created_at,
			});
		} else if (record.entityType === "tag") {
			tags.push({
				id: record.id,
				name: str(p.name) ?? "",
				color: str(p.color),
				projectId: str(p.project_id),
			});
		} else if (record.entityType === "task") {
			taskRecords.push(record);
		}
	}

	const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
	const tasks: Task[] = taskRecords.map(({ id, payload: p }) => ({
		id,
		title: str(p.title) ?? "",
		description: str(p.description),
		projectId: str(p.project_id),
		priority: (str(p.priority) ?? "none") as Priority,
		dueDate: str(p.due_date),
		completedAt: str(p.completed_at),
		deletedAt: str(p.deleted_at),
		tags: (Array.isArray(p.tags) ? p.tags : [])
			.map((tagId) => tagsById.get(String(tagId)))
			.filter((tag): tag is Tag => tag !== undefined),
		sortOrder: 0,
		createdAt: p.created_at,
		updatedAt: p.created_at,
	}));

	return { version: 1, exportedAt, projects, tags, tasks };
}
