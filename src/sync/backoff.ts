/**
 * Décision plan 4c n°2. The server throttles every /v1 route at 20 req/min/IP
 * (Retry-After not guaranteed). Proactive pacing: a client-side token bucket
 * of 18/min — under the server budget, so a long first sync pages through
 * without ever drawing a 429. Reactive backoff: 5→10→20→40s capped at 60s for
 * the 429s pacing cannot prevent (another client on the same IP, a window
 * already spent). The cursor and outbox survive any wait by construction.
 */
export const GATE_CAPACITY = 18;
export const GATE_WINDOW_MS = 60_000;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_CAP_MS = 60_000;

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RequestGate {
	private readonly capacity: number;
	private readonly refillMs: number;
	private readonly now: () => number;
	private readonly sleep: (ms: number) => Promise<void>;
	private tokens: number;
	private lastRefill: number;
	private consecutive429 = 0;

	constructor(opts?: {
		capacity?: number;
		windowMs?: number;
		now?: () => number;
		sleep?: (ms: number) => Promise<void>;
	}) {
		this.capacity = opts?.capacity ?? GATE_CAPACITY;
		this.refillMs = (opts?.windowMs ?? GATE_WINDOW_MS) / this.capacity;
		this.now = opts?.now ?? Date.now;
		this.sleep = opts?.sleep ?? defaultSleep;
		this.tokens = this.capacity;
		this.lastRefill = this.now();
	}

	private refill(): void {
		const elapsed = this.now() - this.lastRefill;
		const refilled = Math.floor(elapsed / this.refillMs);
		if (refilled > 0) {
			this.tokens = Math.min(this.capacity, this.tokens + refilled);
			this.lastRefill += refilled * this.refillMs;
		}
	}

	async beforeRequest(): Promise<void> {
		this.refill();
		while (this.tokens < 1) {
			const wait = this.refillMs - (this.now() - this.lastRefill);
			await this.sleep(Math.max(1, wait));
			this.refill();
		}
		this.tokens -= 1;
	}

	async on429(retryAfterMs: number | null): Promise<void> {
		this.consecutive429 += 1;
		const ladder = Math.min(
			BACKOFF_CAP_MS,
			BACKOFF_BASE_MS * 2 ** (this.consecutive429 - 1),
		);
		await this.sleep(retryAfterMs ?? ladder);
	}

	onSuccess(): void {
		this.consecutive429 = 0;
	}
}
