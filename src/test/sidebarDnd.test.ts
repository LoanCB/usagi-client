import { describe, expect, it } from "vitest";
import {
	computeReorderedIds,
	resolveIntraGroupDrop,
} from "@/components/layout/sidebarDnd";

// Three sibling rows, 32px tall, stacked from y=100.
// A: [100,132) mid 116 | B: [132,164) mid 148 | C: [164,196) mid 180
const siblings = [
	{ id: "A", top: 100, height: 32 },
	{ id: "B", top: 132, height: 32 },
	{ id: "C", top: 164, height: 32 },
];

describe("resolveIntraGroupDrop", () => {
	it("never returns join-group for an in-group reorder (regression: intra-group order was a no-op)", () => {
		// Pointer anywhere in the group body must yield a reorder intent.
		for (const y of [110, 140, 170, 190]) {
			const drop = resolveIntraGroupDrop(y, "g1", "A", siblings);
			expect(drop?.intent).toBe("reorder");
		}
	});

	it("inserts before the sibling whose upper half the pointer is over", () => {
		// y=140 is below B's top (132) but above B's mid (148) → before B
		expect(resolveIntraGroupDrop(140, "g1", "A", siblings)).toEqual({
			intent: "reorder",
			beforeId: "project:B",
		});
	});

	it("inserts before the next sibling once past a midpoint", () => {
		// y=170 is past B's mid (148) and above C's mid (180) → before C
		expect(resolveIntraGroupDrop(170, "g1", "A", siblings)).toEqual({
			intent: "reorder",
			beforeId: "project:C",
		});
	});

	it("returns a group-end sentinel when below the last sibling's midpoint", () => {
		// y=190 is past C's mid (180) → end of the group
		expect(resolveIntraGroupDrop(190, "g1", "A", siblings)).toEqual({
			intent: "reorder",
			beforeId: "group-end:g1",
		});
	});

	it("skips the dragged item so it never targets itself", () => {
		// Dragging B; pointer over B's own row must not produce beforeId project:B
		const drop = resolveIntraGroupDrop(140, "g1", "B", siblings);
		expect(drop).toEqual({ intent: "reorder", beforeId: "project:C" });
	});
});

describe("computeReorderedIds", () => {
	it("moves an item before a later sibling", () => {
		// [A,B,C], drag A before C → [B,A,C]
		expect(computeReorderedIds(["A", "B", "C"], "A", "C")).toEqual([
			"B",
			"A",
			"C",
		]);
	});

	it("moves an item before an earlier sibling", () => {
		// [A,B,C], drag C before B → [A,C,B]
		expect(computeReorderedIds(["A", "B", "C"], "C", "B")).toEqual([
			"A",
			"C",
			"B",
		]);
	});

	it("appends to the end when beforeProjectId is null", () => {
		// [A,B,C], drag A to end → [B,C,A]
		expect(computeReorderedIds(["A", "B", "C"], "A", null)).toEqual([
			"B",
			"C",
			"A",
		]);
	});

	it("returns null for a no-op move (target is the item's current position)", () => {
		// Dragging A before B when A is already right before B → no change
		expect(computeReorderedIds(["A", "B", "C"], "A", "B")).toBeNull();
	});

	it("returns null when the item is not present", () => {
		expect(computeReorderedIds(["A", "B", "C"], "Z", "B")).toBeNull();
	});
});
