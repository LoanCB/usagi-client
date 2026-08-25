import type { AuthorizedHttp } from "./auth";
import type { RequestGate } from "./backoff";
import { SyncHttpError } from "./http";
import {
	CursorOutOfRangeError,
	type PullResponse,
	type PushChange,
	type PushResponse,
	type SyncTransport,
} from "./types";

export class HttpSyncTransport implements SyncTransport {
	constructor(
		private readonly http: AuthorizedHttp,
		private readonly gate: RequestGate,
	) {}

	/**
	 * 429 loops forever on purpose (note 4b): the server throttles by the
	 * minute and both cursor and outbox survive any wait, so giving up would
	 * only trade a pause for a resync later. Everything else escapes to the
	 * engine, which knows what each error means for the sync cycle.
	 */
	private async withGate<T>(run: () => Promise<T>): Promise<T> {
		for (;;) {
			await this.gate.beforeRequest();
			try {
				const out = await run();
				this.gate.onSuccess();
				return out;
			} catch (err) {
				if (err instanceof SyncHttpError && err.status === 429) {
					await this.gate.on429(err.retryAfterMs);
					continue;
				}
				throw err;
			}
		}
	}

	push(changes: PushChange[]): Promise<PushResponse> {
		return this.withGate(() =>
			this.http.request<PushResponse>("POST", "/v1/sync/push", { changes }),
		);
	}

	pull(cursor: number, limit: number): Promise<PullResponse> {
		return this.withGate(async () => {
			try {
				return await this.http.request<PullResponse>(
					"GET",
					`/v1/sync/pull?cursor=${cursor}&limit=${limit}`,
				);
			} catch (err) {
				if (
					err instanceof SyncHttpError &&
					err.status === 409 &&
					err.code === "CURSOR_OUT_OF_RANGE"
				) {
					// Stable contract from plan 4b: this cursor cannot have come
					// from this workspace. The engine resets to 0 and re-pulls.
					throw new CursorOutOfRangeError(err.message);
				}
				throw err;
			}
		});
	}
}
