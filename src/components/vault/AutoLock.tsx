import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIdleLock } from "@/hooks/useIdleLock";
import { useSettingsStore } from "@/store/settings";
import { tauriVaultApi, type VaultApi } from "@/vault";
import { UnlockScreen } from "./UnlockScreen";
import { vaultErrorMessage } from "./vaultErrorMessage";

interface AutoLockProps {
	api?: VaultApi;
	children: ReactNode;
}

/**
 * UI-only lock: the app stays mounted (and its state intact) underneath, but
 * is inert and covered until the vault password is re-entered. The decrypted
 * database stays open in Rust.
 */
export function AutoLock({ api = tauriVaultApi, children }: AutoLockProps) {
	const { t } = useTranslation();
	const minutes = useSettingsStore((s) => s.autoLockMinutes);
	const [locked, setLocked] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Only a password vault can be re-opened; re-check at lock time so a
	// password removed since the setting was chosen never locks the user out.
	const lock = useCallback(() => {
		api.status().then(
			(s) => {
				if (s.state === "password") setLocked(true);
			},
			() => {},
		);
	}, [api]);

	useIdleLock(locked ? 0 : minutes, lock);

	async function unlock(password: string) {
		setBusy(true);
		setError(null);
		try {
			await api.unlockPassword(password);
			setLocked(false);
		} catch (e) {
			setError(vaultErrorMessage(t, e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<div inert={locked} className="contents">
				{children}
			</div>
			{locked && (
				<div className="fixed inset-0 z-[200] bg-background">
					<UnlockScreen busy={busy} error={error} onUnlock={unlock} />
				</div>
			)}
		</>
	);
}
