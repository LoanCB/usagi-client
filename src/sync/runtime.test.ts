// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { getSyncRuntime, setSyncContext, startSync, stopSync } from "./runtime";
import { setSyncState } from "./state";

async function makeContext() {
	const driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	const repo = new SqliteRepository(driver);
	setSyncContext({
		db: driver,
		repository: repo,
		fetchImpl: async () => new Response("{}", { status: 200 }),
		isUnlocked: async () => true,
	});
	return { driver, repo };
}

describe("sync runtime", () => {
	beforeEach(async () => {
		await stopSync();
	});

	// Guard against the last test's setInterval outliving the suite.
	afterEach(async () => {
		await stopSync();
	});

	it("ne démarre rien tant que server_url est absent (§6.1)", async () => {
		await makeContext();
		expect(await startSync()).toBeNull();
		expect(getSyncRuntime()).toBeNull();
	});

	it("démarre une fois la session persistée, et expose le moteur", async () => {
		const { driver } = await makeContext();
		await setSyncState(driver, "server_url", "https://sync.example.com");
		await setSyncState(driver, "refresh_token", "rt-1");

		const runtime = await startSync();
		expect(runtime).not.toBeNull();
		expect(getSyncRuntime()).toBe(runtime);
	});

	it("stopSync arrête le scheduler et oublie le runtime", async () => {
		const { driver } = await makeContext();
		await setSyncState(driver, "server_url", "https://sync.example.com");
		await setSyncState(driver, "refresh_token", "rt-1");
		await startSync();

		await stopSync();
		expect(getSyncRuntime()).toBeNull();
	});

	it("un second startSync ne laisse pas deux schedulers derrière lui", async () => {
		const { driver } = await makeContext();
		await setSyncState(driver, "server_url", "https://sync.example.com");
		await setSyncState(driver, "refresh_token", "rt-1");

		const first = await startSync();
		const second = await startSync();
		expect(second).not.toBe(first);
		expect(getSyncRuntime()).toBe(second);
	});
});
