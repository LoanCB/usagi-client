// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BetterSqliteDriver } from "@/test-harness/BetterSqliteDriver";
import {
	makeDevice,
	syncMerging,
	type TestDevice,
} from "@/test-harness/engine";
import { FakeSyncServer } from "@/test-harness/FakeSyncServer";

/** Deterministic PRNG — the whole scenario replays from its seed. */
function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const BASE_TIME = Date.parse("2026-08-25T12:00:00.000Z");
const OPS_PER_SEED = 60;

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** Counter-based UUIDs: both universes of a seed mint identical ids. */
function stubDeterministicIds(): void {
	let counter = 0;
	vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
		counter += 1;
		return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`;
	});
}

interface Pools {
	tasks: string[];
	projects: string[];
	tags: string[];
}

function pick<T>(rng: () => number, list: T[]): T | undefined {
	if (list.length === 0) return undefined;
	return list[Math.floor(rng() * list.length)];
}

/**
 * One random offline operation through the PRODUCTION repository API. Invalid
 * random targets (e.g. completing an already-purged task) just no-op: the
 * scenario stays deterministic because the guard outcome is deterministic too.
 *
 * `protectedTaskId` (the prologue's shared task) is never purged by the
 * random sequence: purge is terminal (§5.2), so once it is gone the §5
 * tie-break the prologue set up on it can never reach mergePayloads, and the
 * scenario would stop proving what it exists to prove on every execution.
 */
async function randomOp(
	rng: () => number,
	device: TestDevice,
	pools: Pools,
	label: string,
	protectedTaskId: string,
): Promise<void> {
	const roll = Math.floor(rng() * 12);
	try {
		switch (roll) {
			case 0:
			case 1: {
				const task = await device.repo.createTask({
					title: `task ${label}`,
					projectId: pick(rng, pools.projects) ?? undefined,
				});
				pools.tasks.push(task.id);
				return;
			}
			case 2: {
				const id = pick(rng, pools.tasks);
				// The protected task's title carries the prologue's same-millisecond
				// tie (§5 tie-break fixture): a later local rename would overwrite it
				// with a non-tied stamp before either device ever syncs, and the
				// scenario would stop exercising the tie-break it exists to prove.
				if (id && id !== protectedTaskId)
					await device.repo.updateTask(id, { title: `renamed ${label}` });
				return;
			}
			case 3: {
				const id = pick(rng, pools.tasks);
				if (id)
					await device.repo.updateTask(id, {
						priority: (["none", "low", "medium", "high"] as const)[
							Math.floor(rng() * 4)
						],
					});
				return;
			}
			case 4: {
				const id = pick(rng, pools.tasks);
				if (id) await device.repo.completeTask(id);
				return;
			}
			case 5: {
				const id = pick(rng, pools.tasks);
				if (id) await device.repo.archiveTask(id);
				return;
			}
			case 6: {
				const id = pick(rng, pools.tasks);
				if (id && id !== protectedTaskId) await device.repo.deleteTask(id);
				return;
			}
			case 7: {
				const project = await device.repo.createProject({
					name: `project ${label}`,
				});
				pools.projects.push(project.id);
				return;
			}
			case 8: {
				const id = pick(rng, pools.projects);
				if (id) await device.repo.deleteProject(id);
				return;
			}
			case 9: {
				const tag = await device.repo.createTag({ name: `tag ${label}` });
				pools.tags.push(tag.id);
				return;
			}
			case 10: {
				const task = pick(rng, pools.tasks);
				const tag = pick(rng, pools.tags);
				if (task && tag) await device.repo.updateTask(task, { tagIds: [tag] });
				return;
			}
			case 11: {
				const prev = pick(rng, pools.tasks) ?? null;
				const id = pick(rng, pools.tasks);
				if (id && prev && id !== prev)
					await device.repo.moveTask(id, prev, null);
				return;
			}
		}
	} catch {
		// Deterministically-invalid target: skipping is part of the scenario.
	}
}

/** Everything user-visible plus sync metadata, normalised for comparison. */
async function fullDump(driver: BetterSqliteDriver): Promise<unknown> {
	const tables: Array<[string, string[]]> = [
		[
			"tasks",
			[
				"title",
				"description",
				"project_id",
				"priority",
				"due_date",
				"sort_key",
				"completed_at",
				"deleted_at",
			],
		],
		[
			"projects",
			["name", "color", "icon", "group_id", "sort_key", "deleted_at"],
		],
		["tags", ["name", "color", "project_id", "deleted_at"]],
		["project_groups", ["name", "color", "sort_key"]],
	];
	const out: Record<string, unknown> = {};
	for (const [table, cols] of tables) {
		out[table] = await driver.select(
			`SELECT id, ${cols.join(", ")}, field_updated_at, sync_extra FROM ${table} WHERE purged_at IS NULL ORDER BY id`,
		);
		// Tombstones: only identity matters — purge instants are device-local.
		out[`${table}:purged`] = await driver.select(
			`SELECT id FROM ${table} WHERE purged_at IS NOT NULL ORDER BY id`,
		);
	}
	out.task_tags = await driver.select(
		"SELECT task_id, tag_id FROM task_tags ORDER BY task_id, tag_id",
	);
	return out;
}

/** fullDump minus the stamps — the cross-universe comparison: repair writes
 * (orphan reattachment, tag dedup) are stamped at sync time, which differs
 * between reconnection orders; their VALUES must not. */
async function valuesDump(driver: BetterSqliteDriver): Promise<unknown> {
	const dump = (await fullDump(driver)) as Record<
		string,
		Array<Record<string, unknown>>
	>;
	for (const rows of Object.values(dump)) {
		for (const row of rows) {
			delete row.field_updated_at;
		}
	}
	return dump;
}

/** Full sync rounds until a whole round pushes nothing: the §4.1 fixpoint.
 * Not converging within the bound IS a failure — oscillation is the bug
 * class this file exists to catch. */
async function converge(
	server: FakeSyncServer,
	devices: TestDevice[],
): Promise<void> {
	for (let round = 0; round < 8; round++) {
		const before = server.seqCounter;
		for (const device of devices) {
			vi.setSystemTime(Date.now() + 1); // syncs never share an op's clock tick
			await syncMerging(device);
		}
		if (server.seqCounter === before) return;
	}
	throw new Error(
		"no fixpoint after 8 full sync rounds: the devices oscillate",
	);
}

interface UniverseResult {
	dumpA: unknown;
	dumpB: unknown;
	values: unknown;
}

async function runUniverse(
	seed: number,
	order: "ab" | "ba",
): Promise<UniverseResult> {
	vi.useFakeTimers({ now: BASE_TIME });
	stubDeterministicIds();
	const rng = mulberry32(seed);
	const server = new FakeSyncServer();
	const a = await makeDevice(server);
	const b = await makeDevice(server);

	try {
		// Prologue: a shared task, then a guaranteed same-millisecond conflict
		// on the same field — the §5 tie-break runs on EVERY execution.
		const shared = await a.repo.createTask({ title: "shared" });
		vi.setSystemTime(BASE_TIME + 10);
		await syncMerging(a);
		await syncMerging(b);
		vi.setSystemTime(BASE_TIME + 20);
		await a.repo.updateTask(shared.id, { title: "A wrote at the tie" });
		await b.repo.updateTask(shared.id, { title: "B wrote at the tie" });

		// Offline phase: the SAME deterministic op sequence in every universe.
		const poolsA: Pools = { tasks: [shared.id], projects: [], tags: [] };
		const poolsB: Pools = { tasks: [shared.id], projects: [], tags: [] };
		for (let i = 0; i < OPS_PER_SEED; i++) {
			const onA = rng() < 0.5;
			vi.setSystemTime(Date.now() + Math.floor(rng() * 3)); // 0 keeps ties possible
			await randomOp(
				rng,
				onA ? a : b,
				onA ? poolsA : poolsB,
				`${seed}.${i}`,
				shared.id,
			);
		}

		// Reconnection, in this universe's order.
		const devices = order === "ab" ? [a, b] : [b, a];
		vi.setSystemTime(BASE_TIME + 100_000);
		await converge(server, devices);

		const [dumpA, dumpB, values] = [
			await fullDump(a.driver),
			await fullDump(b.driver),
			await valuesDump(a.driver),
		];
		return { dumpA, dumpB, values };
	} finally {
		a.driver.close();
		b.driver.close();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
}

describe("convergence (§8.1) — the high-value test", () => {
	it.each([
		1, 2, 3, 4, 5,
	])("seed %s: A and B end strictly identical, whatever the reconnection order", async (seed) => {
		const forward = await runUniverse(seed, "ab");
		// Within a universe: STRICT equality, stamps and extras included.
		expect(forward.dumpA).toEqual(forward.dumpB);

		const reverse = await runUniverse(seed, "ba");
		expect(reverse.dumpA).toEqual(reverse.dumpB);

		// Across universes: identical values whatever the reconnection
		// order (stamps excluded: repair writes are stamped at sync time).
		expect(forward.values).toEqual(reverse.values);
	}, 60_000);
});
