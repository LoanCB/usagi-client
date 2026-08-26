/** One row of GET /v1/devices. `current` is computed server-side from the
 * device id carried by the JWT. */
export interface SyncDevice {
	id: string;
	name: string;
	platform: string;
	lastSeenAt: string | null;
	createdAt: string;
	current: boolean;
}
