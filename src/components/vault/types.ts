import type { VaultStatus } from "@/vault";

/** Whether the failing keychain call was fetching the key or storing it. */
export type KeychainAccess = "read" | "write";

export type Screen =
	| { kind: "loading" }
	| { kind: "status"; status: VaultStatus; recovering: boolean }
	| { kind: "status-error"; message: string }
	| { kind: "phrase"; phrase: string }
	| { kind: "retry-keychain"; message: string }
	| { kind: "open" };

export type State = { screen: Screen; busy: boolean; error: string | null };

export type Action =
	| { type: "loading" }
	| { type: "status"; status: VaultStatus; preserveRecovering?: boolean }
	| { type: "status-failed"; message: string }
	| { type: "busy" }
	| { type: "failed"; message: string }
	| { type: "keychain-failed"; message: string }
	| { type: "phrase"; phrase: string }
	| { type: "recovering"; value: boolean }
	| { type: "open" };

export type SecurityForm = "set" | "change" | "remove" | null;
