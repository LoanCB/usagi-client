import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VaultCard } from "./VaultMessage";

interface SetupScreenProps {
	legacy: boolean;
	busy: boolean;
	error: string | null;
	onPassword: (password: string) => void;
	onNoPassword: () => void;
}

export function SetupScreen({
	legacy,
	busy,
	error,
	onPassword,
	onNoPassword,
}: SetupScreenProps) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [mismatch, setMismatch] = useState(false);

	function handleSubmit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (password !== confirm) {
			setMismatch(true);
			return;
		}
		onPassword(password);
	}

	return (
		<VaultCard title={t("vault.setupTitle")}>
			<p className="text-muted-foreground">{t("vault.setupIntro")}</p>
			{legacy && <p className="font-medium">{t("vault.legacyNotice")}</p>}
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<label className="flex flex-col gap-1.5" htmlFor="vault-setup-password">
					{t("vault.password")}
					<Input
						id="vault-setup-password"
						type="password"
						autoComplete="new-password"
						value={password}
						onChange={(e) => {
							setPassword(e.target.value);
							setMismatch(false);
						}}
					/>
				</label>
				<label className="flex flex-col gap-1.5" htmlFor="vault-setup-confirm">
					{t("vault.confirmPassword")}
					<Input
						id="vault-setup-confirm"
						type="password"
						autoComplete="new-password"
						value={confirm}
						onChange={(e) => {
							setConfirm(e.target.value);
							setMismatch(false);
						}}
					/>
				</label>
				{mismatch && (
					<p className="text-xs text-destructive">{t("vault.mismatch")}</p>
				)}
				{error && <p className="text-xs text-destructive">{error}</p>}
				<Button type="submit" disabled={busy || password === ""}>
					{busy ? t("vault.working") : t("vault.protect")}
				</Button>
			</form>
			<div className="flex flex-col gap-1.5 border-t border-border pt-4">
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onClick={onNoPassword}
				>
					{t("vault.noPassword")}
				</Button>
				<p className="text-xs text-muted-foreground">
					{t("vault.noPasswordHint")}
				</p>
			</div>
		</VaultCard>
	);
}
