import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { isVaultError, tauriVaultApi, bindAccount, unlockSync } = await import(
	"./index"
);

describe("vault IPC", () => {
	beforeEach(() => invoke.mockReset());

	it("passes camelCase arguments the Rust commands expect", async () => {
		invoke.mockResolvedValue(undefined);
		await tauriVaultApi.unlockRecovery("words", "new-pw");
		expect(invoke).toHaveBeenCalledWith("vault_unlock_recovery", {
			phrase: "words",
			newPassword: "new-pw",
		});
		await unlockSync("blob", "user-1");
		expect(invoke).toHaveBeenLastCalledWith("vault_unlock_sync", {
			localDek: "blob",
			userId: "user-1",
		});
	});

	it("returns what Rust returns", async () => {
		invoke.mockResolvedValue("sealed");
		await expect(bindAccount("wdr")).resolves.toBe("sealed");
		expect(invoke).toHaveBeenCalledWith("vault_bind_account", {
			wrappedDekRecovery: "wdr",
		});
	});

	it("recognises a serialized VaultError", () => {
		expect(isVaultError({ code: "wrong-secret" })).toBe(true);
		expect(isVaultError({ code: "io", detail: "disk" })).toBe(true);
		expect(isVaultError(new Error("x"))).toBe(false);
		expect(isVaultError("wrong-secret")).toBe(false);
	});
});
