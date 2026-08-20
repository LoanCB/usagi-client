import type { DbDriver } from "@/db/driver";
import { splitStatements } from "./split-statements";

/**
 * Errors that are safe to ignore: legacy databases whose user_version was never
 * advanced re-run ALTER TABLE statements whose column already exists. Anything
 * else must abort so user_version is not advanced over a half-applied schema.
 */
function isIgnorable(message: string): boolean {
	return /duplicate column name/i.test(message);
}

export async function runMigrations(
	db: DbDriver,
	migrations: string[],
): Promise<void> {
	const versionRows = await db.select<{ user_version: number }>(
		"PRAGMA user_version",
	);
	const applied = versionRows[0]?.user_version ?? 0;

	for (let version = applied; version < migrations.length; version++) {
		for (const statement of splitStatements(migrations[version])) {
			try {
				// oxlint-disable-next-line react-doctor/async-await-in-loop -- intentional: migration statements are ordered DDL that must run sequentially; parallelizing would race the SQLite lock and corrupt schema order
				await db.execute(statement);
			} catch (err) {
				if (!isIgnorable(String(err))) {
					throw new Error(
						`Migration ${version + 1} failed on statement: ${statement}\n${String(err)}`,
					);
				}
			}
		}
		await db.execute(`PRAGMA user_version = ${version + 1}`);
	}
}
