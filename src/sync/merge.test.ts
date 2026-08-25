import { describe, expect, it } from "vitest";
import { clampStamps, mergePayloads, stampWins } from "./merge";
import type { SyncPayload } from "./types";

const SERVER_MS = Date.parse("2026-08-25T12:00:00.000Z");

function payload(
	fields: Record<string, unknown>,
	stamps: Record<string, { t: string; d: string }>,
): SyncPayload {
	return {
		_v: 1,
		created_at: "2026-08-20T08:00:00.000Z",
		_fields: stamps,
		...fields,
	};
}

describe("stampWins (tie-break: LARGER device id wins, spec §5)", () => {
	it("prefers the newer timestamp regardless of device", () => {
		expect(
			stampWins(
				{ t: "2026-08-25T11:00:00.000Z", d: "aaa" },
				{ t: "2026-08-25T10:00:00.000Z", d: "zzz" },
			),
		).toBe(true);
	});

	it("breaks a strict tie by the larger device id", () => {
		const t = "2026-08-25T10:00:00.000Z";
		expect(stampWins({ t, d: "bbb" }, { t, d: "aaa" })).toBe(true);
		expect(stampWins({ t, d: "aaa" }, { t, d: "bbb" })).toBe(false);
	});

	it('makes legacy authorless stamps (d: "") lose every tie', () => {
		const t = "2026-08-25T10:00:00.000Z";
		expect(stampWins({ t, d: "any-uuid" }, { t, d: "" })).toBe(true);
		expect(stampWins({ t, d: "" }, { t, d: "any-uuid" })).toBe(false);
	});
});

describe("clampStamps (§5.1)", () => {
	it("pulls a stamp more than 24h in the server future back to server time", () => {
		const out = clampStamps(
			{ title: { t: "2027-01-01T00:00:00.000Z", d: "dev" } },
			SERVER_MS,
		);
		expect(out.title).toEqual({ t: "2026-08-25T12:00:00.000Z", d: "dev" });
	});

	it("leaves a stamp inside the 24h window untouched", () => {
		const near = { t: "2026-08-26T11:00:00.000Z", d: "dev" };
		expect(clampStamps({ title: near }, SERVER_MS).title).toEqual(near);
	});
});

describe("mergePayloads", () => {
	it("adopts the remote wholesale when there is no local row", () => {
		const remote = payload(
			{ title: "from B" },
			{ title: { t: "2026-08-25T10:00:00.000Z", d: "b" } },
		);
		const out = mergePayloads(null, remote, SERVER_MS);
		expect(out.payload.title).toBe("from B");
		expect(out.locallyDirty).toBe(false);
	});

	it("merges field by field: each side keeps its newer fields", () => {
		const local = payload(
			{ title: "local title", priority: "low" },
			{
				title: { t: "2026-08-25T11:00:00.000Z", d: "a" },
				priority: { t: "2026-08-25T09:00:00.000Z", d: "a" },
			},
		);
		const remote = payload(
			{ title: "remote title", priority: "high" },
			{
				title: { t: "2026-08-25T10:00:00.000Z", d: "b" },
				priority: { t: "2026-08-25T10:00:00.000Z", d: "b" },
			},
		);
		const out = mergePayloads(local, remote, SERVER_MS);
		expect(out.payload.title).toBe("local title");
		expect(out.payload.priority).toBe("high");
		expect(out.payload._fields.title.d).toBe("a");
		expect(out.payload._fields.priority.d).toBe("b");
		expect(out.locallyDirty).toBe(true); // title won locally → must push back
	});

	it("is clean (not dirty) when the remote wins everything", () => {
		const t0 = { t: "2026-08-25T09:00:00.000Z", d: "a" };
		const t1 = { t: "2026-08-25T10:00:00.000Z", d: "b" };
		const out = mergePayloads(
			payload({ title: "old" }, { title: t0 }),
			payload({ title: "new" }, { title: t1 }),
			SERVER_MS,
		);
		expect(out.payload.title).toBe("new");
		expect(out.locallyDirty).toBe(false);
	});

	it("is clean when both sides carry the identical write (idempotent re-pull)", () => {
		const stamp = { t: "2026-08-25T10:00:00.000Z", d: "a" };
		const out = mergePayloads(
			payload({ title: "same" }, { title: stamp }),
			payload({ title: "same" }, { title: stamp }),
			SERVER_MS,
		);
		expect(out.locallyDirty).toBe(false);
	});

	it("keeps a local-only field and stays dirty (remote never saw it)", () => {
		const out = mergePayloads(
			payload(
				{ title: "x", description: "local note" },
				{
					title: { t: "2026-08-25T09:00:00.000Z", d: "a" },
					description: { t: "2026-08-25T09:00:00.000Z", d: "a" },
				},
			),
			payload(
				{ title: "x" },
				{ title: { t: "2026-08-25T09:00:00.000Z", d: "a" } },
			),
			SERVER_MS,
		);
		expect(out.payload.description).toBe("local note");
		expect(out.locallyDirty).toBe(true);
	});

	it("preserves an unknown remote field verbatim (§5.4)", () => {
		const out = mergePayloads(
			payload(
				{ title: "x" },
				{ title: { t: "2026-08-25T09:00:00.000Z", d: "a" } },
			),
			payload(
				{ title: "x", recurrence: { every: "week" } },
				{
					title: { t: "2026-08-25T09:00:00.000Z", d: "a" },
					recurrence: { t: "2026-08-25T10:00:00.000Z", d: "b" },
				},
			),
			SERVER_MS,
		);
		expect(out.payload.recurrence).toEqual({ every: "week" });
		expect(out.locallyDirty).toBe(false);
	});

	it("clamps a runaway remote clock so it cannot win forever (§5.1)", () => {
		const out = mergePayloads(
			payload(
				{ title: "sane local" },
				{ title: { t: "2026-08-25T11:59:00.000Z", d: "a" } },
			),
			payload(
				{ title: "from the future" },
				{ title: { t: "2027-06-01T00:00:00.000Z", d: "b" } },
			),
			SERVER_MS,
		);
		// Clamped to server time (12:00), which still beats 11:59 — the write is
		// recent and legitimate; what the clamp kills is the *permanent* head start.
		expect(out.payload.title).toBe("from the future");
		expect(out.payload._fields.title.t).toBe("2026-08-25T12:00:00.000Z");
	});

	it("resolves a strict tie identically whichever side is local (convergence)", () => {
		const t = "2026-08-25T10:00:00.000Z";
		const asSeenByA = mergePayloads(
			payload({ title: "A wrote" }, { title: { t, d: "device-aaa" } }),
			payload({ title: "B wrote" }, { title: { t, d: "device-bbb" } }),
			SERVER_MS,
		);
		const asSeenByB = mergePayloads(
			payload({ title: "B wrote" }, { title: { t, d: "device-bbb" } }),
			payload({ title: "A wrote" }, { title: { t, d: "device-aaa" } }),
			SERVER_MS,
		);
		expect(asSeenByA.payload.title).toBe("B wrote");
		expect(asSeenByB.payload.title).toBe("B wrote");
		expect(asSeenByA.locallyDirty).toBe(false); // A lost: nothing to push
		expect(asSeenByB.locallyDirty).toBe(true); // B won against A's pushed value
	});
});
