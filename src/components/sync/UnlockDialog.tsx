import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SyncUnlockOfflineError } from "@/sync/types";

export interface UnlockDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Rejects when the password is wrong. Resolves once the vault is open. */
	onUnlock: (password: string) => Promise<void>;
}

export function UnlockDialog({
	open,
	onOpenChange,
	onUnlock,
}: UnlockDialogProps) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<"wrong-password" | "offline" | null>(
		null,
	);

	// The component stays mounted across open/close: without this, a failed
	// attempt (stale error + stale password) would resurface on reopen.
	useEffect(() => {
		if (!open) {
			setPassword("");
			setFailure(null);
		}
	}, [open]);

	async function handleSubmit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (password === "" || busy) return;
		setBusy(true);
		setFailure(null);
		try {
			await onUnlock(password);
			// Drop it as soon as the vault is open: it derives the KEK.
			setPassword("");
			onOpenChange(false);
		} catch (err) {
			// An offline user gets a message that does not accuse their password:
			// telling them "wrong password" would make them retype a correct one.
			setFailure(
				err instanceof SyncUnlockOfflineError ? "offline" : "wrong-password",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("sync.unlock.title")}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<DialogDescription>{t("sync.unlock.intro")}</DialogDescription>
					<div className="flex flex-col gap-1.5">
						<label className="text-sm" htmlFor="sync-unlock-password">
							{t("sync.password")}
						</label>
						<Input
							id="sync-unlock-password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(e) => {
								setPassword(e.target.value);
								setFailure(null);
							}}
						/>
					</div>
					{failure && (
						<p className="text-xs text-destructive">
							{t(
								failure === "offline"
									? "sync.unlock.offline"
									: "sync.unlock.failed",
							)}
						</p>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={password === "" || busy}>
							{busy ? t("sync.unlock.unlocking") : t("sync.unlock.submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
