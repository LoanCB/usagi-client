import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VaultCard } from "./VaultMessage";

interface RecoverScreenProps {
	syncBound: boolean;
	busy: boolean;
	error: string | null;
	onRecover: (phrase: string, newPassword: string) => void;
	onBack: () => void;
}

export function RecoverScreen({
	syncBound,
	busy,
	error,
	onRecover,
	onBack,
}: RecoverScreenProps) {
	const { t } = useTranslation();
	const [phrase, setPhrase] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [mismatch, setMismatch] = useState(false);
	return (
		<VaultCard title={t("vault.recoverTitle")}>
			<p className="text-muted-foreground">{t("vault.recoverIntro")}</p>
			{syncBound && (
				<p className="text-xs text-muted-foreground">
					{t("vault.recoverSyncHint")}
				</p>
			)}
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (password !== confirm) {
						setMismatch(true);
						return;
					}
					onRecover(phrase, password);
				}}
			>
				<label className="flex flex-col gap-1.5" htmlFor="vault-recover-phrase">
					{t("vault.recoveryPhrase")}
					<textarea
						id="vault-recover-phrase"
						rows={3}
						autoComplete="off"
						spellCheck={false}
						className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
						value={phrase}
						onChange={(e) => setPhrase(e.target.value)}
					/>
				</label>
				<label
					className="flex flex-col gap-1.5"
					htmlFor="vault-recover-password"
				>
					{t("vault.newPassword")}
					<Input
						id="vault-recover-password"
						type="password"
						autoComplete="new-password"
						value={password}
						onChange={(e) => {
							setPassword(e.target.value);
							setMismatch(false);
						}}
					/>
				</label>
				<label
					className="flex flex-col gap-1.5"
					htmlFor="vault-recover-confirm"
				>
					{t("vault.confirmPassword")}
					<Input
						id="vault-recover-confirm"
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
				<Button
					type="submit"
					disabled={busy || phrase.trim() === "" || password === ""}
				>
					{busy ? t("vault.unlocking") : t("vault.recover")}
				</Button>
			</form>
			<Button type="button" variant="ghost" size="sm" onClick={onBack}>
				{t("vault.back")}
			</Button>
		</VaultCard>
	);
}
