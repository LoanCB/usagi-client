import { describe, expect, it, vi } from "vitest";
import type { AuthorizedHttp } from "./auth";
import { listDevices, revokeDevice } from "./devices";

function fakeHttp(
	impl: (method: string, path: string) => unknown,
): AuthorizedHttp {
	return {
		request: vi.fn(async (method, path) => impl(method, path)),
	} as unknown as AuthorizedHttp;
}

describe("listDevices", () => {
	it("appelle GET /v1/devices et rend la liste telle quelle", async () => {
		const payload = [
			{
				id: "11111111-1111-4111-8111-111111111111",
				name: "Poste fixe",
				platform: "linux",
				lastSeenAt: "2026-08-26T09:00:00.000Z",
				createdAt: "2026-08-01T09:00:00.000Z",
				current: true,
			},
		];
		const http = fakeHttp(() => payload);
		await expect(listDevices(http)).resolves.toEqual(payload);
		expect(http.request).toHaveBeenCalledWith("GET", "/v1/devices");
	});

	it("tolère un lastSeenAt absent", async () => {
		const http = fakeHttp(() => [
			{
				id: "22222222-2222-4222-8222-222222222222",
				name: "Portable",
				platform: "macos",
				lastSeenAt: null,
				createdAt: "2026-08-02T09:00:00.000Z",
				current: false,
			},
		]);
		const [device] = await listDevices(http);
		expect(device.lastSeenAt).toBeNull();
	});
});

describe("revokeDevice", () => {
	it("appelle DELETE /v1/devices/:id", async () => {
		const http = fakeHttp(() => undefined);
		await revokeDevice(http, "33333333-3333-4333-8333-333333333333");
		expect(http.request).toHaveBeenCalledWith(
			"DELETE",
			"/v1/devices/33333333-3333-4333-8333-333333333333",
		);
	});

	it("encode l'identifiant dans le chemin", async () => {
		const http = fakeHttp(() => undefined);
		await revokeDevice(http, "a b/c");
		expect(http.request).toHaveBeenCalledWith(
			"DELETE",
			"/v1/devices/a%20b%2Fc",
		);
	});
});
