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
import { SyncUnlockOfflineError, SyncUnlockReauthError } from "@/sync/types";

/** Same shape, two jobs: re-derive the KEK for an authenticated session
 * ("unlock"), or replay a full sign-in against the stored server and email
 * after the session itself expired ("reauth"). Only the copy differs. */
export type UnlockDialogMode = "unlock" | "reauth";

const COPY = {
	unlock: {
		title: "sync.unlock.title",
		intro: "sync.unlock.intro",
		submit: "sync.unlock.submit",
		busy: "sync.unlock.unlocking",
	},
	reauth: {
		title: "sync.reauth.title",
		intro: "sync.reauth.intro",
		submit: "sync.signIn",
		busy: "sync.signingIn",
	},
} as const;

const FAILURE_KEY = {
	"wrong-password": "sync.unlock.failed",
	offline: "sync.unlock.offline",
	"session-expired": "sync.unlock.sessionExpired",
} as const;

type Failure = keyof typeof FAILURE_KEY;

export interface UnlockDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode?: UnlockDialogMode;
	/** Rejects when the password is wrong. Resolves once the vault is open. */
	onUnlock: (password: string) => Promise<void>;
}

export function UnlockDialog({
	open,
	onOpenChange,
	mode = "unlock",
	onUnlock,
}: UnlockDialogProps) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<Failure | null>(null);
	const copy = COPY[mode];

	// The component stays mounted across open/close: without this, a failed
	// attempt (stale error + stale password) would resurface on reopen. `open`
	// is a controlled prop that can flip to false from outside (not just via
	// the handlers below), so syncing on the prop itself is the only place
	// that catches every path.
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
			// Neither an offline user nor one whose session expired has a password
			// problem: telling them "wrong password" makes them retype a correct
			// one, and in the expired case no password can ever succeed here.
			setFailure(
				err instanceof SyncUnlockOfflineError
					? "offline"
					: err instanceof SyncUnlockReauthError
						? "session-expired"
						: "wrong-password",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t(copy.title)}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<DialogDescription>{t(copy.intro)}</DialogDescription>
					<div className="flex flex-col gap-1.5">
						<label className="text-sm" htmlFor={`sync-${mode}-password`}>
							{t("sync.password")}
						</label>
						<Input
							id={`sync-${mode}-password`}
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
							{t(FAILURE_KEY[failure])}
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
							{busy ? t(copy.busy) : t(copy.submit)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
