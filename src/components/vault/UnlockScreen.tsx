import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VaultCard } from "./VaultMessage";

interface UnlockScreenProps {
	busy: boolean;
	error: string | null;
	onUnlock: (password: string) => void;
	/** Omitted on the idle lock, where recovery is not offered. */
	onForgot?: () => void;
}

export function UnlockScreen({
	busy,
	error,
	onUnlock,
	onForgot,
}: UnlockScreenProps) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	return (
		<VaultCard title={t("vault.unlockTitle")}>
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (password !== "") onUnlock(password);
				}}
			>
				<label
					className="flex flex-col gap-1.5"
					htmlFor="vault-unlock-password"
				>
					{t("vault.password")}
					<Input
						id="vault-unlock-password"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
				</label>
				{error && <p className="text-xs text-destructive">{error}</p>}
				<Button type="submit" disabled={busy || password === ""}>
					{busy ? t("vault.unlocking") : t("vault.unlock")}
				</Button>
			</form>
			{onForgot && (
				<Button type="button" variant="ghost" size="sm" onClick={onForgot}>
					{t("vault.forgot")}
				</Button>
			)}
		</VaultCard>
	);
}
