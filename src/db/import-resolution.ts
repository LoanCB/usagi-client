import type { ExportData } from "@/lib/dataTransfer";
import type { Tag } from "@/types";

/**
 * How an import resolves the references its payload carries against the rows
 * the importing device actually holds.
 *
 * A backup carries no guarantee that its foreign keys resolve here.
 * `dataTransfer.ts` exports tasks carrying `projectId` while sending
 * `projects: []` whenever the "projects" checkbox is unchecked, and `tags.name`
 * is globally UNIQUE, so a payload tag routinely collides with a local one
 * under a different id. Every such reference used to abort the whole import
 * with a foreign key violation, and the dialog reported a valid backup as
 * corrupt.
 *
 * Resolving at import time rather than at export time is deliberate: it lets
 * the same tasks-only backup restore intact onto the device it came from and
 * degrade only where the referent is genuinely gone.
 *
 * `bulkImport` reads its referents live from its own transaction;
 * `predictReferents` models the same end state from what the device holds
 * beforehand, so the import dialog can report the loss before consenting to it
 * instead of afterwards.
 */

/** What an import has to change to fit the rows this device holds. */
export interface ImportGaps {
	/** Tasks whose project is absent here; they import into the Inbox. */
	inboxedTasks: number;
	/** Tags whose project scope is absent here; they import unscoped. */
	unscopedTags: number;
	/** Task→tag links with no tag here and no same-name tag to absorb them. */
	droppedTagLinks: number;
}

export const NO_IMPORT_GAPS: ImportGaps = {
	inboxedTasks: 0,
	unscopedTags: 0,
	droppedTagLinks: 0,
};

export function hasImportGaps(gaps: ImportGaps): boolean {
	return (
		gaps.inboxedTasks > 0 || gaps.unscopedTags > 0 || gaps.droppedTagLinks > 0
	);
}

/** The rows an import can point a foreign key at once its own writes land. */
export interface ImportReferents {
	readonly projectIds: ReadonlySet<string>;
	readonly tagIds: ReadonlySet<string>;
	readonly tagIdByName: ReadonlyMap<string, string>;
}

/** The live rows a device holds before an import runs. */
export interface LocalRows {
	readonly projectIds: readonly string[];
	readonly tags: readonly { readonly id: string; readonly name: string }[];
}

/**
 * The project a row should end up in: the one it names, or the Inbox.
 *
 * Only live projects count. A tombstone still satisfies the foreign key, so
 * without this a replace import would leave its tasks hanging off a purged row
 * that no sidebar ever lists.
 */
export function resolveProjectRef(
	projectId: string | null,
	projectIds: ReadonlySet<string>,
): string | null {
	return projectId !== null && projectIds.has(projectId) ? projectId : null;
}

/**
 * The tag id a task→tag link should point at, or null to drop the link.
 *
 * Falling back to the tag of the same name is what keeps tag assignments across
 * an ordinary two-device merge: `tags.name` is globally UNIQUE, so the tags loop
 * OR IGNOREs the payload's row and the local one keeps the name. That already
 * decided the local tag wins the collision — this finishes the decision instead
 * of dropping the link. UNIQUE(name) guarantees at most one candidate.
 */
export function resolveTagLink(
	tag: Pick<Tag, "id" | "name">,
	referents: Pick<ImportReferents, "tagIds" | "tagIdByName">,
): string | null {
	return referents.tagIds.has(tag.id)
		? tag.id
		: (referents.tagIdByName.get(tag.name) ?? null);
}

/**
 * The referents `bulkImport` will be able to point at, derived from what the
 * device holds now.
 *
 * Modelled rather than executed, so a preview writes nothing. The
 * "predicts exactly what the import then does" test is what keeps the model and
 * `bulkImport` from drifting apart.
 */
export function predictReferents(
	data: ExportData,
	local: LocalRows,
	strategy: "merge" | "replace",
): ImportReferents {
	// A replace tombstones every local row the payload leaves out, and a
	// tombstone is not a referent — so only the payload's own rows survive it.
	const projectIds = new Set(
		strategy === "replace"
			? data.projects.map((p) => p.id)
			: [...local.projectIds, ...data.projects.map((p) => p.id)],
	);

	const surviving = strategy === "replace" ? [] : local.tags;
	const tagIds = new Set(surviving.map((t) => t.id));
	const tagIdByName = new Map(surviving.map((t) => [t.name, t.id]));
	for (const tag of data.tags) {
		// Merge mode inserts tags OR IGNORE, so a payload tag whose id or whose
		// UNIQUE name is already taken is silently skipped and the local row keeps
		// the name. Replaying that in payload order is what makes the count match.
		if (
			strategy === "merge" &&
			(tagIds.has(tag.id) || tagIdByName.has(tag.name))
		) {
			continue;
		}
		tagIds.add(tag.id);
		tagIdByName.set(tag.name, tag.id);
	}

	return { projectIds, tagIds, tagIdByName };
}

/** Count what `data` would lose against `referents`, changing nothing. */
export function countImportGaps(
	data: ExportData,
	referents: ImportReferents,
): ImportGaps {
	const gaps: ImportGaps = { ...NO_IMPORT_GAPS };

	for (const task of data.tasks) {
		if (
			task.projectId !== null &&
			resolveProjectRef(task.projectId, referents.projectIds) === null
		) {
			gaps.inboxedTasks++;
		}
		for (const tag of task.tags) {
			if (resolveTagLink(tag, referents) === null) gaps.droppedTagLinks++;
		}
	}

	for (const tag of data.tags) {
		if (
			tag.projectId !== null &&
			resolveProjectRef(tag.projectId, referents.projectIds) === null
		) {
			gaps.unscopedTags++;
		}
	}

	return gaps;
}
