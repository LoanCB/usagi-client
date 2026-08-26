import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { useSyncStore } from "@/store/sync";
import { ReauthRequiredError, SyncUnlockReauthError } from "@/sync/types";

const h = vi.hoisted(() => {
	const calls: string[] = [];
	return {
		calls,
		constructed: [] as { baseUrl: string }[],
		state: {} as Record<string, string | null>,
		lock: vi.fn(async () => {
			calls.push("lock");
		}),
		completeUnlock: vi.fn(async () => {}),
		beginUnlock: vi.fn(async () => "verifier"),
		stopSync: vi.fn(async () => {
			calls.push("stopSync");
		}),
		startSync: vi.fn(async () => null),
		getSyncRuntime: vi.fn(() => null),
		signOutAccount: vi.fn(async () => {
			calls.push("signOutAccount");
		}),
		prelogin: vi.fn(async () => ({ salt: "salt", kdfParams: {} })),
		listDevices: vi.fn(async () => []),
		revokeDevice: vi.fn(async () => {}),
		request: vi.fn(async () => ({ wrappedDek: "wrapped" })),
	};
});

vi.mock("@/crypto", () => ({
	lock: h.lock,
	completeUnlock: h.completeUnlock,
	beginUnlock: h.beginUnlock,
	prepareRegistration: vi.fn(),
}));

vi.mock("@/sync/auth", () => {
	class AuthorizedHttp {
		request = h.request;
		constructor(deps: { baseUrl: string }) {
			h.constructed.push(deps);
		}
	}
	return {
		AuthorizedHttp,
		getServerInfo: vi.fn(),
		prelogin: h.prelogin,
		register: vi.fn(),
		signIn: vi.fn(),
		signOut: h.signOutAccount,
		tauriVault: {
			beginUnlock: h.beginUnlock,
			completeUnlock: h.completeUnlock,
			prepareRegistration: vi.fn(),
		},
	};
});

vi.mock("@/sync/devices", () => ({
	listDevices: h.listDevices,
	revokeDevice: h.revokeDevice,
}));

vi.mock("@/sync/state", () => ({
	getSyncState: vi.fn(
		async (_db: unknown, key: string) => h.state[key] ?? null,
	),
}));

let context: { db: object; repository: object; fetchImpl: unknown };

vi.mock("@/sync/runtime", () => ({
	getSyncContext: () => context,
	getSyncRuntime: h.getSyncRuntime,
	startSync: h.startSync,
	stopSync: h.stopSync,
}));

const { productionSyncDeps } = await import("./sync-panel-deps");

function freshContext() {
	context = { db: {}, repository: {}, fetchImpl: vi.fn() };
}

beforeEach(() => {
	vi.clearAllMocks();
	h.calls.length = 0;
	h.constructed.length = 0;
	h.state = {
		server_url: "https://sync.example.com",
		account_email: "a@example.com",
		user_id: "user-1",
	};
	h.request.mockResolvedValue({ wrappedDek: "wrapped" });
	freshContext();
});

describe("productionSyncDeps", () => {
	it("garde la même identité entre deux appels sur le même contexte", () => {
		// SettingsDialog calls this inside render; SyncPanel's mount effect and
		// DeviceList's refresh both key on the deps identity, so a fresh object
		// per render refetches the devices and resets the screen mid-flow.
		expect(productionSyncDeps()).toBe(productionSyncDeps());
	});

	it("reconstruit les dépendances quand le contexte de sync change", () => {
		const first = productionSyncDeps();
		freshContext();
		expect(productionSyncDeps()).not.toBe(first);
	});
});

describe("signOut", () => {
	it("arrête le planificateur et verrouille le coffre AVANT d'effacer la session", async () => {
		await productionSyncDeps().signOut();
		// signOutAccount POSTs /v1/auth/logout first and can hang; a scheduler
		// still live during that window rewrites cursor after the wipe commits.
		expect(h.calls).toEqual(["stopSync", "lock", "signOutAccount"]);
	});

	it("détache le store de synchronisation", async () => {
		useSyncStore.setState({ status: "idle", lastSyncAt: "2026-08-26" });
		await productionSyncDeps().signOut();
		expect(useSyncStore.getState().status).toBeNull();
	});

	it("ne touche à rien quand server_url manque déjà", async () => {
		h.state.server_url = null;
		await expect(productionSyncDeps().signOut()).rejects.toThrow(/server_url/);
		expect(h.calls).toEqual([]);
	});
});

describe("appels authentifiés", () => {
	it("réutilise un seul AuthorizedHttp pour toutes les actions du panneau", async () => {
		const deps = productionSyncDeps();
		await deps.listDevices();
		await deps.revokeDevice("device-2");
		await deps.unlock("hunter2hunter2");
		// One instance per (db, baseUrl): a fresh one starts tokenless and forces
		// a refresh, and the refresh token is a single shared row.
		expect(h.constructed).toHaveLength(1);
		expect(h.constructed[0].baseUrl).toBe("https://sync.example.com");
	});
});

describe("unlock", () => {
	it("distingue une session révoquée d'un mot de passe erroné", async () => {
		h.request.mockRejectedValue(new ReauthRequiredError("refresh rejected"));
		await expect(
			productionSyncDeps().unlock("correct-password"),
		).rejects.toBeInstanceOf(SyncUnlockReauthError);
	});
});
