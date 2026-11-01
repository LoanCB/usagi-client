// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { MemoryRepository } from "@/test-harness/MemoryRepository";
import { ALL_MIGRATIONS } from "./migrations/index";
import { runMigrations } from "./migrations/run-migrations";
import type { TodoRepository } from "./repository";
import { SqliteRepository } from "./sqlite-repository";
import { TagNameTakenError } from "./tag-errors";

async function realRepo(): Promise<TodoRepository> {
	const driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	return new SqliteRepository(driver);
}

// Run against both: the harness has no UNIQUE constraint of its own.
describe.each<[string, () => Promise<TodoRepository>]>([
	["SqliteRepository", realRepo],
	["MemoryRepository", async () => new MemoryRepository()],
])("tag names — %s", (_name, makeRepo) => {
	let repo: TodoRepository;

	beforeEach(async () => {
		repo = await makeRepo();
	});

	it("can reuse the name of a deleted tag", async () => {
		const first = await repo.createTag({ name: "Urgent" });
		await repo.deleteTag(first.id);

		const second = await repo.createTag({ name: "Urgent" });

		expect(second.id).not.toBe(first.id);
		expect((await repo.getTags()).map((tag) => tag.id)).toEqual([second.id]);
	});

	it("can rename a tag to the name of a deleted tag", async () => {
		const deleted = await repo.createTag({ name: "Urgent" });
		await repo.deleteTag(deleted.id);
		const tag = await repo.createTag({ name: "Later" });

		await repo.updateTag(tag.id, { name: "Urgent" });

		expect((await repo.getTags()).map((t) => t.name)).toEqual(["Urgent"]);
	});

	it("refuses a name a live tag already uses", async () => {
		await repo.createTag({ name: "Urgent" });
		const other = await repo.createTag({ name: "Later" });

		await expect(repo.createTag({ name: "Urgent" })).rejects.toBeInstanceOf(
			TagNameTakenError,
		);
		await expect(
			repo.updateTag(other.id, { name: "Urgent" }),
		).rejects.toBeInstanceOf(TagNameTakenError);
	});

	it("lets a tag keep its own name", async () => {
		const tag = await repo.createTag({ name: "Urgent", color: "#111111" });

		await repo.updateTag(tag.id, { name: "Urgent", color: "#222222" });

		expect((await repo.getTags())[0].color).toBe("#222222");
	});
});
