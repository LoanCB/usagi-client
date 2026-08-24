import { beforeEach, describe, expect, it } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations/index";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import type { ExportData } from "@/lib/dataTransfer";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { MemoryRepository } from "@/test-harness/MemoryRepository";

describe("MemoryRepository — import resolution agrees with the real repository", () => {
	// The harness enforces no referential integrity, which is why a whole class
	// of import bug reached a re-review undetected: the same case passed here
	// whatever the code did. Pinning the harness against real SQLite stops it
	// telling store tests a story the app does not live by.
	let db: BetterSqliteDriver;
	let sqlite: SqliteRepository;
	let memory: MemoryRepository;

	beforeEach(async () => {
		db = new BetterSqliteDriver();
		await runMigrations(db, ALL_MIGRATIONS);
		sqlite = new SqliteRepository(db);
		memory = new MemoryRepository();
	});

	const unresolvable: ExportData = {
		version: 1,
		exportedAt: "2026-05-18T10:00:00.000Z",
		projects: [],
		tags: [{ id: "g1", name: "scoped", color: "#fff", projectId: "p-missing" }],
		tasks: [
			{
				id: "t1",
				title: "Task",
				description: null,
				projectId: "p-missing",
				priority: "none",
				dueDate: null,
				completedAt: null,
				deletedAt: null,
				tags: [{ id: "g-gone", name: "gone", color: "#fff", projectId: null }],
				sortOrder: 0,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		],
	};

	it("reports the same gaps", async () => {
		expect(await memory.previewImport(unresolvable, "merge")).toEqual(
			await sqlite.previewImport(unresolvable, "merge"),
		);
	});

	it("sends a task whose project is absent to the Inbox", async () => {
		await memory.bulkImport(unresolvable, "merge");
		const tasks = await memory.getTasks({ allTasks: true });
		expect(tasks.map((t) => t.projectId)).toEqual([null]);
	});

	it("drops a tag link with no tag behind it", async () => {
		await memory.bulkImport(unresolvable, "merge");
		const tasks = await memory.getTasks({ allTasks: true });
		expect(tasks[0].tags).toEqual([]);
	});

	it("keeps the local tag on a name collision, like SqliteRepository", async () => {
		// tags.name is globally UNIQUE, so the real tags loop OR IGNOREs the
		// payload's row and the local one keeps the name. A harness that inserts
		// it anyway holds two tags sharing a name — a state the schema forbids,
		// and it would resolve the task's link to a tag the app cannot have.
		const local = await memory.createTag({ name: "shared", color: "#fff" });
		await sqlite.createTag({ name: "shared", color: "#fff" });
		const colliding: ExportData = {
			...unresolvable,
			tags: [
				{ id: "g-remote", name: "shared", color: "#fff", projectId: null },
			],
			tasks: [
				{
					...unresolvable.tasks[0],
					projectId: null,
					tags: [
						{ id: "g-remote", name: "shared", color: "#fff", projectId: null },
					],
				},
			],
		};

		await memory.bulkImport(colliding, "merge");
		await sqlite.bulkImport(colliding, "merge");

		const memoryTags = await memory.getTags();
		expect(memoryTags.map((t) => t.name).sort()).toEqual(
			(await sqlite.getTags()).map((t) => t.name).sort(),
		);
		const tasks = await memory.getTasks({ allTasks: true });
		expect(tasks[0].tags.map((t) => t.id)).toEqual([local.id]);
	});

	it("imports a tag scoped to an absent project as unscoped", async () => {
		await memory.bulkImport(unresolvable, "merge");
		const tags = await memory.getTags();
		expect(tags.map((t) => t.projectId)).toEqual([null]);
	});
});
