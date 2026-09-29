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

export function VaultCard({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-popover p-6 text-sm ring-1 ring-foreground/10">
				<h1 className="text-base font-semibold">{title}</h1>
				{children}
			</div>
		</div>
	);
}
