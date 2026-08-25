/**
 * Spec §5.1: LWW rests on client timestamps, so a device set six months in the
 * future would win every conflict forever. The sync engine measures the offset
 * against serverTime and sets it here; every stamp the app produces (repository
 * writes included) reads through this module so the correction applies at the
 * source. Offset 0 — the default, and the permanent state while sync is off —
 * makes this an identity function.
 */
let offsetMs = 0;

export function setClockOffsetMs(ms: number): void {
	offsetMs = ms;
}

export function getClockOffsetMs(): number {
	return offsetMs;
}

export function nowMs(): number {
	return Date.now() + offsetMs;
}

export function nowIso(): string {
	return new Date(nowMs()).toISOString();
}
