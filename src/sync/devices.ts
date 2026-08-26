import type { AuthorizedHttp } from "./auth";
import type { SyncDevice } from "./devices-types";

export type { SyncDevice } from "./devices-types";

export function listDevices(http: AuthorizedHttp): Promise<SyncDevice[]> {
	return http.request<SyncDevice[]>("GET", "/v1/devices");
}

/**
 * The server answers 404 — never 403 — when the id is not this account's, so a
 * probe cannot confirm an id exists. Callers surface both the same way.
 */
export async function revokeDevice(
	http: AuthorizedHttp,
	id: string,
): Promise<void> {
	await http.request<void>("DELETE", `/v1/devices/${encodeURIComponent(id)}`);
}
