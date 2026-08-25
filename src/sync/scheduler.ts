export const SYNC_INTERVAL_MS = 5 * 60_000;
export const WRITE_DEBOUNCE_MS = 2_000;

/**
 * Spec §4.2 (v1): sync on start, on window focus, every 5 minutes, and 2s
 * after a local write (debounced). No WebSocket — real time is a later
 * improvement that does not change the protocol. Overlapping triggers are
 * harmless: the engine is single-flight and coalesces reruns.
 */
export class SyncScheduler {
	private readonly intervalMs: number;
	private readonly debounceMs: number;
	private readonly windowTarget: Window | null;
	private interval: ReturnType<typeof setInterval> | null = null;
	private debounce: ReturnType<typeof setTimeout> | null = null;
	private readonly onFocus = () => void this.engine.syncNow();

	constructor(
		private readonly engine: { syncNow(): Promise<void> },
		opts: {
			intervalMs?: number;
			debounceMs?: number;
			windowTarget?: Window | null;
		} = {},
	) {
		this.intervalMs = opts.intervalMs ?? SYNC_INTERVAL_MS;
		this.debounceMs = opts.debounceMs ?? WRITE_DEBOUNCE_MS;
		this.windowTarget =
			opts.windowTarget !== undefined
				? opts.windowTarget
				: typeof window !== "undefined"
					? window
					: null;
	}

	start(): void {
		void this.engine.syncNow();
		this.interval = setInterval(
			() => void this.engine.syncNow(),
			this.intervalMs,
		);
		this.windowTarget?.addEventListener("focus", this.onFocus);
	}

	notifyLocalWrite(): void {
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = setTimeout(() => {
			this.debounce = null;
			void this.engine.syncNow();
		}, this.debounceMs);
	}

	stop(): void {
		if (this.interval) clearInterval(this.interval);
		if (this.debounce) clearTimeout(this.debounce);
		this.interval = null;
		this.debounce = null;
		this.windowTarget?.removeEventListener("focus", this.onFocus);
	}
}
