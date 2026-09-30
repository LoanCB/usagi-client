export type VaultState =
	| "fresh"
	| "legacy-plaintext"
	| "keychain"
	| "password"
	| "broken";

export interface VaultStatus {
	state: VaultState;
	/** A plaintext → encrypted migration was interrupted; unlocking resumes it. */
	migrating: boolean;
	/** The database key is also wrapped by the sync account's DEK. */
	syncBound: boolean;
	brokenReason: "corrupt" | "vault-missing" | null;
}

export type VaultErrorCode =
	| "wrong-secret"
	| "keychain-denied"
	| "key-missing"
	| "corrupt"
	| "migration-failed"
	| "io"
	| "invalid-state";

/** The shape Rust's VaultError serializes to. */
export interface VaultError {
	code: VaultErrorCode;
	detail?: string;
}

/** Injected into the gate and the Security tab so tests need no Tauri runtime. */
export interface VaultApi {
	status(): Promise<VaultStatus>;
	setupKeychain(): Promise<void>;
	/** Resolves with the 24-word recovery phrase: show once, never persist. */
	setupPassword(password: string): Promise<string>;
	unlockKeychain(): Promise<void>;
	unlockPassword(password: string): Promise<void>;
	unlockRecovery(phrase: string, newPassword: string): Promise<void>;
	/** Resolves with the 24-word recovery phrase: show once, never persist. */
	setPassword(password: string): Promise<string>;
	changePassword(current: string, newPassword: string): Promise<void>;
	removePassword(current: string): Promise<void>;
}
