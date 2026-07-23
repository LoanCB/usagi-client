import { arrayMove } from "@dnd-kit/sortable";
import type { Project, ProjectGroup } from "@/types";

export type SidebarItem =
	| { type: "group"; group: ProjectGroup; projects: Project[]; dndId: string }
	| { type: "project"; project: Project; dndId: string };

export type DropState =
	| { intent: "reorder"; beforeId: string | null }
	| { intent: "merge"; targetId: string }
	| { intent: "join-group"; groupId: string }
	| null;

/** dndId sentinel meaning "drop at the very end of this group's children". */
export function groupEndId(groupId: string): string {
	return `group-end:${groupId}`;
}

/**
 * Resolve the drop target while the pointer is inside an expanded group whose
 * children are being reordered (the dragged project already belongs to it).
 *
 * Returns a `reorder` intent pointing before the sibling under the pointer, or
 * a group-end sentinel when the pointer is below the last sibling. It never
 * returns `join-group`: re-joining a project to its own group is a no-op, which
 * is why intra-group reordering silently did nothing before this existed.
 */
export function resolveIntraGroupDrop(
	pointerY: number,
	groupId: string,
	draggedProjectId: string,
	siblings: ReadonlyArray<{ id: string; top: number; height: number }>,
): DropState {
	for (const s of siblings) {
		if (s.id === draggedProjectId) continue;
		if (pointerY < s.top + s.height / 2) {
			return { intent: "reorder", beforeId: `project:${s.id}` };
		}
	}
	return { intent: "reorder", beforeId: groupEndId(groupId) };
}

/**
 * Compute the reordered id list for a drag-and-drop move.
 *
 * `beforeId` is the id to insert the dragged item before, or `null` to append
 * at the end. Returns `null` when the move is a no-op or the ids are unknown,
 * so callers can skip persisting.
 */
export function computeReorderedIds(
	ids: string[],
	draggedId: string,
	beforeId: string | null,
): string[] | null {
	const oldIdx = ids.indexOf(draggedId);
	const newIdx = beforeId ? ids.indexOf(beforeId) : ids.length;
	if (oldIdx === -1 || newIdx === -1) return null;
	const adjusted = newIdx > oldIdx ? newIdx - 1 : newIdx;
	if (adjusted === oldIdx) return null; // lands where it already is → no-op
	return arrayMove(ids, oldIdx, adjusted);
}
