import { describe, expect, it } from "vitest";
import {
	payloadToWrite,
	SYNC_FIELDS,
	snapshotToPayload,
	UNLINKED_TAGS_KEY,
} from "./payload";
import type { SyncPayload } from "./types";

const STAMP = { t: "2026-08-25T10:00:00.000Z", d: "device-a" };

function taskSnapshot(
	over: Partial<{ columns: Record<string, unknown>; tagIds: string[] }> = {},
) {
	return {
		columns: {
			id: "t1",
			title: "Buy bread",
			description: null,
			project_id: "p1",
			priority: "high",
			due_date: null,
			sort_key: "a0",
			completed_at: null,
			deleted_at: null,
			purged_at: null,
			created_at: "2026-08-20T08:00:00.000Z",
			updated_at: "2026-08-25T10:00:00.000Z",
			sort_order: 0,
			field_updated_at: JSON.stringify({ title: STAMP }),
			sync_extra: null,
			...over.columns,
		},
		tagIds: over.tagIds ?? ["tag-1", "tag-2"],
	};
}

describe("snapshotToPayload", () => {
	it("builds the spec §2.2 payload from a task row", () => {
		const payload = snapshotToPayload("task", taskSnapshot());
		expect(payload._v).toBe(1);
		expect(payload.created_at).toBe("2026-08-20T08:00:00.000Z");
		expect(payload.title).toBe("Buy bread");
		expect(payload.tags).toEqual(["tag-1", "tag-2"]);
		expect(payload._fields).toEqual({ title: STAMP });
		// Operational columns never enter the encrypted payload.
		expect(payload).not.toHaveProperty("updated_at");
		expect(payload).not.toHaveProperty("sort_order");
		expect(payload).not.toHaveProperty("purged_at");
		expect(payload).not.toHaveProperty("id");
	});

	it("re-emits unknown fields and folds _unlinkedTags back into tags (§5.4)", () => {
		const payload = snapshotToPayload(
			"task",
			taskSnapshot({
				columns: {
					sync_extra: JSON.stringify({
						recurrence: { every: "week" },
						[UNLINKED_TAGS_KEY]: ["tag-ghost"],
					}),
				},
			}),
		);
		expect(payload.recurrence).toEqual({ every: "week" });
		expect(payload.tags).toEqual(["tag-1", "tag-2", "tag-ghost"]);
		expect(payload).not.toHaveProperty(UNLINKED_TAGS_KEY);
	});

	it("tolerates corrupt stamp and extra JSON instead of crashing the loop", () => {
		const payload = snapshotToPayload(
			"task",
			taskSnapshot({
				columns: { field_updated_at: "{oops", sync_extra: "{oops" },
			}),
		);
		expect(payload._fields).toEqual({});
	});
});

describe("payloadToWrite", () => {
	function remotePayload(): SyncPayload {
		return {
			_v: 1,
			created_at: "2026-08-20T08:00:00.000Z",
			_fields: { title: STAMP, tags: STAMP, recurrence: STAMP },
			title: "Buy bread",
			description: null,
			project_id: null,
			priority: "none",
			due_date: null,
			sort_key: "a1",
			completed_at: null,
			deleted_at: null,
			tags: ["tag-1", "tag-ghost"],
			recurrence: { every: "week" },
		};
	}

	it("splits known columns, linkable tags and unknown extras", () => {
		const write = payloadToWrite("task", remotePayload(), new Set(["tag-1"]));
		expect(write.columns.title).toBe("Buy bread");
		expect(write.columns.created_at).toBe("2026-08-20T08:00:00.000Z");
		expect(write.columns).not.toHaveProperty("tags");
		expect(write.tagIds).toEqual(["tag-1"]);
		expect(JSON.parse(write.extra ?? "{}")).toEqual({
			recurrence: { every: "week" },
			[UNLINKED_TAGS_KEY]: ["tag-ghost"],
		});
		expect(JSON.parse(write.stamps)).toEqual(remotePayload()._fields);
	});

	it("emits null extra when there is nothing extra", () => {
		const payload = remotePayload();
		payload.tags = ["tag-1"];
		delete payload.recurrence;
		const write = payloadToWrite("task", payload, new Set(["tag-1"]));
		expect(write.extra).toBeNull();
	});

	it("round-trips: write → snapshot → payload preserves values, stamps and extras", () => {
		const write = payloadToWrite("task", remotePayload(), new Set(["tag-1"]));
		const back = snapshotToPayload("task", {
			columns: {
				...write.columns,
				id: "t1",
				purged_at: null,
				updated_at: "x",
				sort_order: 0,
				field_updated_at: write.stamps,
				sync_extra: write.extra,
			},
			tagIds: write.tagIds,
		});
		const original = remotePayload();
		for (const f of SYNC_FIELDS.task) {
			if (f === "tags") expect(back.tags).toEqual(["tag-1", "tag-ghost"]);
			else expect(back[f]).toEqual(original[f]);
		}
		expect(back.recurrence).toEqual(original.recurrence);
		expect(back._fields).toEqual(original._fields);
	});
});
