export type ServerUrlError = "empty" | "malformed" | "insecure";

export interface ServerUrlResult {
	/** Normalised, without a trailing slash. Null when the input is unusable. */
	url: string | null;
	error: ServerUrlError | null;
	/** True when http:// was tolerated because the host is local (§6.2). */
	insecureWarning: boolean;
}

/**
 * Spec §6.2 demands https, with an explicit carve-out for localhost, 127.0.0.1
 * and .local domains — without it self-hosting on a LAN and development are
 * impractical.
 *
 * Matched on the parsed hostname, never on the raw string: "localhost.attacker.com"
 * contains "localhost" and "not-local.example.com" contains ".local", and a
 * substring test would hand both a plaintext channel.
 */
function isLocalHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return (
		host === "localhost" ||
		host === "127.0.0.1" ||
		// URL.hostname keeps the brackets on an IPv6 literal, so "[::1]" is the
		// only form that ever reaches here.
		host === "[::1]" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local")
	);
}

const FAILURE = { url: null, insecureWarning: false } as const;

export function normalizeServerUrl(raw: string): ServerUrlResult {
	const trimmed = raw.trim();
	if (trimmed === "") return { ...FAILURE, error: "empty" };

	// A bare host is the common case when typing; assume the secure scheme
	// rather than rejecting, so the carve-out below stays the exception.
	const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		return { ...FAILURE, error: "malformed" };
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return { ...FAILURE, error: "malformed" };
	}
	if (parsed.hostname === "") return { ...FAILURE, error: "malformed" };

	const insecure = parsed.protocol === "http:";
	if (insecure && !isLocalHost(parsed.hostname)) {
		return { ...FAILURE, error: "insecure" };
	}

	// Drop query and fragment: a base URL carrying either would corrupt every
	// path the sync client appends to it.
	const path = parsed.pathname.replace(/\/+$/, "");
	return {
		url: `${parsed.protocol}//${parsed.host}${path}`,
		error: null,
		insecureWarning: insecure,
	};
}
