import { ALL_MIGRATIONS } from "@/db/migrations";
import { runMigrations } from "@/db/migrations/run-migrations";
import { SqliteRepository } from "@/db/sqlite-repository";
import { SyncEngine } from "@/sync/engine";
import type { ServerInfo } from "@/sync/types";
import { BetterSqliteDriver } from "./BetterSqliteDriver";
import { FakeRecordCipher } from "./FakeRecordCipher";
import type { FakeSyncServer } from "./FakeSyncServer";

export const FAKE_SERVER_INFO: ServerInfo = {
	name: "usagi-server",
	version: "0.0.0-test",
	protocolVersion: 1,
	registrationEnabled: false,
	minClientVersion: "0.1.0",
};

export interface TestDevice {
	driver: BetterSqliteDriver;
	repo: SqliteRepository;
	engine: SyncEngine;
	cipher: FakeRecordCipher;
}

/** A device = a real migrated SQLite (triggers included) + an engine on it. */
export async function makeDevice(
	server: FakeSyncServer,
	opts: {
		cipher?: FakeRecordCipher;
		serverInfo?: ServerInfo;
		isUnlocked?: () => Promise<boolean>;
	} = {},
): Promise<TestDevice> {
	const driver = new BetterSqliteDriver();
	await runMigrations(driver, ALL_MIGRATIONS);
	const cipher = opts.cipher ?? new FakeRecordCipher();
	const engine = new SyncEngine({
		db: driver,
		transport: server.transport(),
		cipher,
		getServerInfo: async () => opts.serverInfo ?? FAKE_SERVER_INFO,
		isUnlocked: opts.isUnlocked ?? (async () => true),
	});
	return { driver, repo: new SqliteRepository(driver), engine, cipher };
}

/** Sync, answering the §6.4 first-sync question with "merge" if it comes up. */
export async function syncMerging(device: TestDevice): Promise<void> {
	await device.engine.syncNow();
	if (device.engine.getStatus() === "awaiting-first-sync") {
		await device.engine.resolveFirstSync("merge");
	}
}
