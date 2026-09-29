import { type ReactNode, useEffect, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RecoveryPhraseStep } from "@/components/sync/RecoveryPhraseStep";
import { Button } from "@/components/ui/button";
import { isVaultError, tauriVaultApi, type VaultApi } from "@/vault";
import { RecoverScreen } from "./RecoverScreen";
import { reducer } from "./reducer";
import { SetupScreen } from "./SetupScreen";
import type { KeychainAccess } from "./types";
import { UnlockScreen } from "./UnlockScreen";
import { VaultCard, vaultErrorMessage } from "./VaultMessage";

interface VaultGateProps {
	api?: VaultApi;
	children: ReactNode;
	random?: () => number;
}

/**
 * Rendered instead of the app, not over it: nothing that reads the database
 * is mounted until Rust has registered the decrypted pool.
 */
export function VaultGate({
	api = tauriVaultApi,
	children,
	random,
}: VaultGateProps) {
	const { t } = useTranslation();
	const [state, dispatch] = useReducer(reducer, {
		screen: { kind: "loading" },
		busy: false,
		error: null,
	});
	// StrictMode runs effects twice in dev; the keychain unlock must start once.
	const started = useRef(false);

	async function loadStatus() {
		try {
			const status = await api.status();
			dispatch({ type: "status", status });
			if (status.state === "keychain") await unlockKeychain();
		} catch (e) {
			dispatch({ type: "status-failed", message: vaultErrorMessage(t, e) });
		}
	}

	async function fail(e: unknown, keychainAccess?: KeychainAccess) {
		const message = vaultErrorMessage(t, e, keychainAccess);
		if (isVaultError(e) && e.code === "migration-failed") {
			// A rolled-back migration puts the vault back in its previous state, so
			// re-read it rather than trust the status the form was rendered from.
			try {
				dispatch({
					type: "status",
					status: await api.status(),
					preserveRecovering: true,
				});
			} catch {
				// Keep the current screen; the error below is still shown.
			}
		}
		dispatch({ type: "failed", message });
	}

	async function run(
		action: () => Promise<void>,
		keychainAccess?: KeychainAccess,
	) {
		dispatch({ type: "busy" });
		try {
			await action();
			dispatch({ type: "open" });
		} catch (e) {
			await fail(e, keychainAccess);
		}
	}

	async function unlockKeychain() {
		dispatch({ type: "busy" });
		try {
			await api.unlockKeychain();
			dispatch({ type: "open" });
		} catch (e) {
			if (
				isVaultError(e) &&
				(e.code === "key-missing" || e.code === "corrupt")
			) {
				dispatch({
					type: "status",
					status: {
						state: "broken",
						migrating: false,
						syncBound: false,
						brokenReason: e.code === "corrupt" ? "corrupt" : null,
					},
				});
				dispatch({ type: "failed", message: vaultErrorMessage(t, e) });
				return;
			}
			dispatch({ type: "keychain-failed", message: vaultErrorMessage(t, e) });
		}
	}

	// oxlint-disable-next-line react-doctor/no-set-state-after-await-in-effect -- dispatch is guarded by the started ref and the gate never unmounts before it resolves
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount; the started ref guards re-entry
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		void loadStatus();
	}, []);

	const { screen, busy, error } = state;
	if (screen.kind === "open") return <>{children}</>;
	if (screen.kind === "loading")
		return <div className="min-h-screen bg-background" />;

	if (screen.kind === "status-error") {
		return (
			<VaultCard title={t("vault.unlockTitle")}>
				<p className="text-destructive">{screen.message}</p>
				<Button
					type="button"
					onClick={() => {
						dispatch({ type: "loading" });
						void loadStatus();
					}}
				>
					{t("vault.retry")}
				</Button>
			</VaultCard>
		);
	}

	if (screen.kind === "phrase") {
		return (
			<VaultCard title={t("vault.setupTitle")}>
				<RecoveryPhraseStep
					phrase={screen.phrase}
					random={random}
					onConfirmed={() => dispatch({ type: "open" })}
				/>
			</VaultCard>
		);
	}

	if (screen.kind === "retry-keychain") {
		return (
			<VaultCard title={t("vault.unlockTitle")}>
				<p className="text-destructive">{screen.message}</p>
				<Button
					type="button"
					disabled={busy}
					onClick={() => void unlockKeychain()}
				>
					{t("vault.retry")}
				</Button>
			</VaultCard>
		);
	}

	const { status, recovering } = screen;
	switch (status.state) {
		case "fresh":
		case "legacy-plaintext":
			return (
				<SetupScreen
					legacy={status.state === "legacy-plaintext"}
					busy={busy}
					error={error}
					onNoPassword={() =>
						// Setting up stores the key; unlocking later reads it.
						void run(() => api.setupKeychain(), "write")
					}
					onPassword={(password) => {
						dispatch({ type: "busy" });
						api.setupPassword(password).then(
							(phrase) => dispatch({ type: "phrase", phrase }),
							(e) => void fail(e),
						);
					}}
				/>
			);
		case "password":
			return recovering ? (
				<RecoverScreen
					syncBound={status.syncBound}
					busy={busy}
					error={error}
					onBack={() => dispatch({ type: "recovering", value: false })}
					onRecover={(phrase, pw) =>
						void run(() => api.unlockRecovery(phrase, pw))
					}
				/>
			) : (
				<UnlockScreen
					busy={busy}
					error={error}
					onForgot={() => dispatch({ type: "recovering", value: true })}
					onUnlock={(pw) => void run(() => api.unlockPassword(pw))}
				/>
			);
		case "keychain":
			return <div className="min-h-screen bg-background" />;
		case "broken":
			return (
				<VaultCard title={t("vault.brokenTitle")}>
					<p className="text-destructive">
						{error ??
							(status.brokenReason === "vault-missing"
								? t("vault.brokenVaultMissing")
								: t("vault.brokenCorrupt"))}
					</p>
				</VaultCard>
			);
	}
}
