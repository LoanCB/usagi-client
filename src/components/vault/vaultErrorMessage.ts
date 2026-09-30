import type { TFunction } from "i18next";
import { isVaultError } from "@/vault";
import type { KeychainAccess } from "./types";

/** One place mapping a thrown vault error to the sentence the user reads. */
export function vaultErrorMessage(
	t: TFunction,
	e: unknown,
	keychainAccess: KeychainAccess = "read",
): string {
	if (!isVaultError(e)) return t("vault.genericError", { detail: String(e) });
	switch (e.code) {
		case "wrong-secret":
			return t("vault.wrongSecret");
		case "keychain-denied":
			return keychainAccess === "write"
				? t("vault.keychainWriteDenied")
				: t("vault.keychainDenied");
		case "key-missing":
			return t("vault.brokenKeyMissing");
		case "migration-failed":
			return t("vault.migrationFailed");
		case "corrupt":
			return t("vault.brokenCorrupt");
		default:
			return t("vault.genericError", { detail: e.detail ?? e.code });
	}
}
