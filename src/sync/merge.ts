import type { FieldStamp, FieldStamps } from "@/db/field-timestamps";
import type { SyncPayload } from "./types";

export const CLOCK_CLAMP_MS = 24 * 60 * 60 * 1000;

/**
 * Spec §5 rule 1. ISO 8601 UTC strings with fixed millisecond precision
 * compare correctly as strings, so no Date parsing. On a strict tie the
 * LARGER device id wins — the direction is binding (spec correction of
 * 2026-08-23): migration 010 blanked legacy stamps to d: "", and "" sorting
 * below every uuid means an attributed write beats an authorless one.
 */
export function stampWins(
	candidate: FieldStamp,
	incumbent: FieldStamp,
): boolean {
	if (candidate.t !== incumbent.t) return candidate.t > incumbent.t;
	return candidate.d > incumbent.d;
}

/** Spec §5.1: a stamp more than 24h past server time is pulled back to it. */
export function clampStamps(
	stamps: FieldStamps,
	serverTimeMs: number,
): FieldStamps {
	const horizon = new Date(serverTimeMs + CLOCK_CLAMP_MS).toISOString();
	const serverIso = new Date(serverTimeMs).toISOString();
	const out: FieldStamps = {};
	for (const [field, stamp] of Object.entries(stamps)) {
		out[field] = stamp.t > horizon ? { t: serverIso, d: stamp.d } : stamp;
	}
	return out;
}

export interface MergeResult {
	payload: SyncPayload;
	/**
	 * True when at least one local field strictly won (or exists only
	 * locally): the merged row differs from what the server holds and must be
	 * pushed back. False means the outbox entry the apply just caused can be
	 * deleted in the same transaction — the §9.5 requirement.
	 */
	locallyDirty: boolean;
}

const META_KEYS = new Set(["_v", "_fields", "created_at"]);
const EMPTY_STAMP: FieldStamp = { t: "", d: "" };

function fieldNames(
	local: SyncPayload | null,
	remote: SyncPayload,
): Set<string> {
	const names = new Set<string>();
	for (const source of [local, remote]) {
		if (!source) continue;
		for (const key of Object.keys(source)) {
			if (!META_KEYS.has(key) && !key.startsWith("_")) names.add(key);
		}
		for (const key of Object.keys(source._fields)) names.add(key);
	}
	return names;
}

export function mergePayloads(
	local: SyncPayload | null,
	remote: SyncPayload,
	serverTimeMs: number,
): MergeResult {
	const remoteStamps = clampStamps(remote._fields, serverTimeMs);
	if (local === null) {
		return {
			payload: { ...remote, _fields: remoteStamps },
			locallyDirty: false,
		};
	}

	const merged: SyncPayload = {
		_v: 1,
		// created_at is identity metadata, not an LWW field: the local row was
		// born once; adopting a remote value would just churn bytes.
		created_at: local.created_at,
		_fields: {},
	};
	let locallyDirty = false;

	for (const name of fieldNames(local, remote)) {
		const localStamp = local._fields[name];
		const remoteStamp = remoteStamps[name];
		const localHas = localStamp !== undefined || name in local;
		const remoteHas = remoteStamp !== undefined || name in remote;

		let takeLocal: boolean;
		if (!remoteHas) takeLocal = true;
		else if (!localHas) takeLocal = false;
		else {
			// A value with no stamp at all (pre-4a legacy) carries the empty
			// stamp, which loses to any attributed or dated write.
			takeLocal = !stampWins(
				remoteStamp ?? EMPTY_STAMP,
				localStamp ?? EMPTY_STAMP,
			);
		}

		if (takeLocal) {
			if (name in local) merged[name] = local[name];
			merged._fields[name] = localStamp ?? EMPTY_STAMP;
			const rs = remoteStamp ?? (remoteHas ? EMPTY_STAMP : undefined);
			const ls = localStamp ?? EMPTY_STAMP;
			if (!rs || rs.t !== ls.t || rs.d !== ls.d) locallyDirty = true;
		} else {
			if (name in remote) merged[name] = remote[name];
			merged._fields[name] = remoteStamp ?? EMPTY_STAMP;
		}
	}

	return { payload: merged, locallyDirty };
}
