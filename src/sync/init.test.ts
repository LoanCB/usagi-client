// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import { FakeRecordCipher } from "@/test-harness/FakeRecordCipher";
import { initSync } from "./init";
import { withWriteNotifications } from "./notifying-repository";
import { setSyncState } from "./state";

let driver: BetterSqliteDriver;
let repo: SqliteRepository;

beforeEach(async () => {
	vi.useFakeTimers();
	driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	repo = new SqliteRepository(driver);
});
afterEach(() => {
	driver?.close();
	vi.useRealTimers();
});

describe("initSync — sync off means OFF (§6.1, §8.2)", () => {
	it("without server_url: no engine, no request, no timer — ever", async () => {
		const fetchSpy = vi.fn();
		const runtime = await initSync(driver, repo, {
			fetchImpl: fetchSpy as unknown as typeof fetch,
			cipher: new FakeRecordCipher(),
			isUnlocked: async () => true,
		});
		expect(runtime).toBeNull();
		// Local writes and hours of uptime must not wake anything up.
		await repo.createTask({ title: "purely local" });
		vi.advanceTimersByTime(60 * 60 * 1000);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("with a server_url but no refresh token (signed out): stays inert", async () => {
		await setSyncState(driver, "server_url", "https://sync.example");
		const fetchSpy = vi.fn();
		const runtime = await initSync(driver, repo, {
			fetchImpl: fetchSpy as unknown as typeof fetch,
			cipher: new FakeRecordCipher(),
			isUnlocked: async () => true,
		});
		expect(runtime).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("with a full session: starts the scheduler and syncs through the given fetch", async () => {
		await setSyncState(driver, "server_url", "https://sync.example");
		await setSyncState(driver, "refresh_token", "refresh-1");
		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify({ statusCode: 500 }), { status: 500 }),
		);
		const runtime = await initSync(driver, repo, {
			fetchImpl: fetchSpy as unknown as typeof fetch,
			cipher: new FakeRecordCipher(),
			isUnlocked: async () => true,
		});
		expect(runtime).not.toBeNull();
		await vi.runOnlyPendingTimersAsync();
		// The start trigger fired and reached the network layer (server-info).
		expect(fetchSpy).toHaveBeenCalled();
		runtime?.scheduler.stop();
	});
});

describe("withWriteNotifications", () => {
	it("notifies after a write, not after a read", async () => {
		const onWrite = vi.fn();
		const wrapped = withWriteNotifications(repo, onWrite);
		await wrapped.getTasks();
		expect(onWrite).not.toHaveBeenCalled();
		await wrapped.createTask({ title: "hello" });
		expect(onWrite).toHaveBeenCalledTimes(1);
	});
});
