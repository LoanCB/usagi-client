export type FetchLike = typeof fetch;

export class SyncHttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string | null,
		public readonly retryAfterMs: number | null,
		message: string,
	) {
		super(message);
		this.name = "SyncHttpError";
	}
}

/**
 * Thrown when the transport call itself fails (never reached the server), as
 * opposed to SyncHttpError which carries a real HTTP status. @tauri-apps/
 * plugin-http's fetch rejects with whatever invoke() propagates — typically a
 * serialized Rust error string, not a browser TypeError — so "offline" cannot
 * be recognised by `instanceof TypeError` in production. Wrapping every
 * transport failure into this one type lets the engine treat offline as the
 * normal state §7 requires, regardless of which fetch implementation is used.
 */
export class SyncNetworkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SyncNetworkError";
	}
}

/**
 * The one door every engine request goes through. fetch is injected: the real
 * caller passes @tauri-apps/plugin-http's fetch (IPC to Rust, not governed by
 * the webview CSP), tests pass a stub. The server speaks camelCase JSON and
 * NestJS error envelopes; the stable machine-readable part of an error is its
 * `code` field (e.g. CURSOR_OUT_OF_RANGE), the message is for logs only.
 */
export async function requestJson<T>(
	fetchImpl: FetchLike,
	method: "GET" | "POST" | "PUT" | "DELETE",
	url: string,
	opts: { body?: unknown; accessToken?: string } = {},
): Promise<T> {
	const headers: Record<string, string> = {};
	if (opts.body !== undefined) headers["content-type"] = "application/json";
	if (opts.accessToken) headers.authorization = `Bearer ${opts.accessToken}`;

	let res: Response;
	try {
		res = await fetchImpl(url, {
			method,
			headers,
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		});
	} catch (err) {
		// tauri-plugin-http rejects with a serialized Rust error, not a
		// TypeError: fold every transport failure into one typed error so the
		// engine can treat "offline" as the normal state §7 requires, whatever
		// fetch implementation threw it.
		throw new SyncNetworkError(String(err));
	}

	if (!res.ok) {
		let code: string | null = null;
		let message = `HTTP ${res.status} on ${method} ${url}`;
		try {
			const payload = (await res.json()) as {
				code?: string;
				message?: unknown;
			};
			if (typeof payload.code === "string") code = payload.code;
			if (payload.message) message += `: ${JSON.stringify(payload.message)}`;
		} catch {
			// Non-JSON error body (proxy page, empty body): status alone must do.
		}
		const retryAfter = res.headers.get("retry-after");
		const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
		throw new SyncHttpError(
			res.status,
			code,
			Number.isFinite(seconds) ? seconds * 1_000 : null,
			message,
		);
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}
