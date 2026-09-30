import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RecoveryPhraseStep } from "@/components/sync/RecoveryPhraseStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tauriVaultApi, type VaultApi, type VaultStatus } from "@/vault";
import type { SecurityForm } from "./types";
import { vaultErrorMessage } from "./vaultErrorMessage";

interface SecurityPanelProps {
	api?: VaultApi;
	/** Raised while a one-shot recovery key is on screen (see SettingsDialog). */
	onDismissBlockedChange?: (blocked: boolean) => void;
	random?: () => number;
}

export function SecurityPanel({
	api = tauriVaultApi,
	onDismissBlockedChange,
	random,
}: SecurityPanelProps) {
	const { t } = useTranslation();
	const [status, setStatus] = useState<VaultStatus | null>(null);
	const [form, setForm] = useState<SecurityForm>(null);
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [phrase, setPhrase] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [saved, setSaved] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt re-runs the load on retry
	useEffect(() => {
		let cancelled = false;
		api.status().then(
			(s) => {
				if (!cancelled) setStatus(s);
			},
			(err) => {
				if (!cancelled) setLoadError(vaultErrorMessage(t, err));
			},
		);
		return () => {
			cancelled = true;
		};
	}, [api, t, loadAttempt]);

	// The action already succeeded; a failed refresh must not report it as failed.
	async function refreshStatus() {
		try {
			setStatus(await api.status());
		} catch {
			// Keep the last known status.
		}
	}

	function retryLoad() {
		setLoadError(null);
		setLoadAttempt((n) => n + 1);
	}

	const missingRequired =
		(form !== null && form !== "set" && current === "") ||
		((form === "set" || form === "change") && next === "");

	function open(which: SecurityForm) {
		setForm(which);
		setCurrent("");
		setNext("");
		setConfirm("");
		setError(null);
		setSaved(false);
	}

	async function submit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (form !== "remove" && next !== confirm) {
			setError(t("vault.mismatch"));
			return;
		}
		setBusy(true);
		setError(null);
		try {
			if (form === "set") {
				const words = await api.setPassword(next);
				setPhrase(words);
				onDismissBlockedChange?.(true);
			} else if (form === "change") {
				await api.changePassword(current, next);
				setSaved(true);
			} else if (form === "remove") {
				await api.removePassword(current);
				setSaved(true);
			}
			setForm(null);
			await refreshStatus();
		} catch (err) {
			// Removing the password is the one action here that stores the key
			// in the keychain.
			setError(vaultErrorMessage(t, err, form === "remove" ? "write" : "read"));
		} finally {
			setBusy(false);
		}
	}

	if (!status) {
		return (
			<div className="flex flex-col items-start gap-3 py-4" role="tabpanel">
				{loadError && (
					<>
						<p className="text-xs text-destructive">{loadError}</p>
						<Button type="button" variant="outline" onClick={retryLoad}>
							{t("vault.retry")}
						</Button>
					</>
				)}
			</div>
		);
	}

	if (phrase) {
		return (
			<div className="py-4" role="tabpanel">
				<RecoveryPhraseStep
					phrase={phrase}
					random={random}
					onConfirmed={() => {
						setPhrase(null);
						onDismissBlockedChange?.(false);
						void refreshStatus();
					}}
				/>
			</div>
		);
	}

	const keychain = status.state === "keychain";
	const locked = status.syncBound;

	return (
		<div className="flex flex-col gap-4 py-4" role="tabpanel">
			<p className="text-sm">
				{keychain
					? t("vault.securityKeychain")
					: locked
						? t("vault.securitySynced")
						: t("vault.securityPassword")}
			</p>
			{saved && (
				<p className="text-xs text-muted-foreground">{t("vault.saved")}</p>
			)}
			{locked && (
				<p className="text-xs text-muted-foreground">
					{t("vault.accountPasswordLater")}
				</p>
			)}

			<div className="flex flex-wrap gap-2">
				{keychain ? (
					<Button type="button" variant="outline" onClick={() => open("set")}>
						{t("vault.setPassword")}
					</Button>
				) : (
					<>
						<Button
							type="button"
							variant="outline"
							disabled={locked}
							onClick={() => open("change")}
						>
							{t("vault.changePassword")}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={locked}
							onClick={() => open("remove")}
						>
							{t("vault.removePassword")}
						</Button>
					</>
				)}
			</div>

			{form && (
				<form
					onSubmit={submit}
					className="flex max-w-sm flex-col gap-3 border-t border-border pt-4"
				>
					{form !== "set" && (
						<label
							className="flex flex-col gap-1.5 text-sm"
							htmlFor="security-current"
						>
							{t("vault.currentPassword")}
							<Input
								id="security-current"
								type="password"
								autoComplete="current-password"
								value={current}
								onChange={(e) => setCurrent(e.target.value)}
							/>
						</label>
					)}
					{form !== "remove" && (
						<>
							<label
								className="flex flex-col gap-1.5 text-sm"
								htmlFor="security-new"
							>
								{t("vault.newPassword")}
								<Input
									id="security-new"
									type="password"
									autoComplete="new-password"
									value={next}
									onChange={(e) => setNext(e.target.value)}
								/>
							</label>
							<label
								className="flex flex-col gap-1.5 text-sm"
								htmlFor="security-confirm"
							>
								{t("vault.confirmPassword")}
								<Input
									id="security-confirm"
									type="password"
									autoComplete="new-password"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
								/>
							</label>
						</>
					)}
					{form === "remove" && (
						<p className="text-xs text-muted-foreground">
							{t("vault.noPasswordHint")}
						</p>
					)}
					{error && <p className="text-xs text-destructive">{error}</p>}
					<div className="flex gap-2">
						<Button type="submit" disabled={busy || missingRequired}>
							{t("vault.save")}
						</Button>
						<Button type="button" variant="ghost" onClick={() => setForm(null)}>
							{t("vault.cancel")}
						</Button>
					</div>
				</form>
			)}
		</div>
	);
}
