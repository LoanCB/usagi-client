import { invoke } from "@tauri-apps/api/core";
import type {
	VaultApi,
	VaultError,
	VaultErrorCode,
	VaultStatus,
} from "./types";

export type {
	VaultApi,
	VaultError,
	VaultErrorCode,
	VaultState,
	VaultStatus,
} from "./types";

// The database key and the DEK never cross this boundary: every call below
// sends a password or a sealed blob and gets back a sealed blob, a recovery
// phrase (shown once, never persisted), or nothing.

const CODES: ReadonlySet<VaultErrorCode> = new Set([
	"wrong-secret",
	"keychain-denied",
	"key-missing",
	"corrupt",
	"migration-failed",
	"io",
	"invalid-state",
]);

export function isVaultError(e: unknown): e is VaultError {
	return (
		typeof e === "object" &&
		e !== null &&
		CODES.has((e as { code?: unknown }).code as VaultErrorCode)
	);
}

export const tauriVaultApi: VaultApi = {
	status: () => invoke<VaultStatus>("vault_status"),
	setupKeychain: () => invoke("vault_setup_keychain"),
	setupPassword: (password) =>
		invoke<string>("vault_setup_password", { password }),
	unlockKeychain: () => invoke("vault_unlock_keychain"),
	unlockPassword: (password) => invoke("vault_unlock_password", { password }),
	unlockRecovery: (phrase, newPassword) =>
		invoke("vault_unlock_recovery", { phrase, newPassword }),
	setPassword: (password) => invoke<string>("vault_set_password", { password }),
	changePassword: (current, newPassword) =>
		invoke("vault_change_password", { current, newPassword }),
	removePassword: (current) => invoke("vault_remove_password", { current }),
};

export function bindAccount(wrappedDekRecovery: string): Promise<string> {
	return invoke<string>("vault_bind_account", { wrappedDekRecovery });
}

export function unbindAccount(): Promise<void> {
	return invoke("vault_unbind_account");
}

export function unlockSync(localDek: string, userId: string): Promise<void> {
	return invoke("vault_unlock_sync", { localDek, userId });
}

export function sealBackup(plaintext: string): Promise<string> {
	return invoke<string>("vault_seal_backup", { plaintext });
}

export function openBackup(blob: string): Promise<string> {
	return invoke<string>("vault_open_backup", { blob });
}
