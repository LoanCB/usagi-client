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

/**
 * How far back a reading may fall before it counts as a real correction rather
 * than measurement jitter. serverTime is taken server-side, so each cycle's
 * offset moves by up to the request latency.
 */
const JITTER_MS = 10_000;

let lastMs = 0;

/**
 * Strictly increasing within one device (§5 rule 1 compares stamps): a cycle
 * that measures the offset a little lower must not stamp the next edit before
 * the previous one, or that edit loses LWW on every other device. A drop larger
 * than the jitter is a genuine correction (§5.1) and applies at once — holding
 * it back would keep a fast clock's stamps in the future.
 */
export function nowMs(): number {
	const reading = Date.now() + offsetMs;
	const regression = lastMs - reading;
	lastMs = regression >= 0 && regression < JITTER_MS ? lastMs + 1 : reading;
	return lastMs;
}

export function nowIso(): string {
	return new Date(nowMs()).toISOString();
}
