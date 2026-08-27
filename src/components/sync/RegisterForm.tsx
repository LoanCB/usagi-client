import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecoveryPhraseStep } from "./RecoveryPhraseStep";

export interface RegisterFormProps {
	/** Resolves with the 24-word recovery phrase returned by register(). */
	onSubmit: (input: {
		email: string;
		password: string;
		inviteToken?: string;
	}) => Promise<string>;
	onComplete: () => void;
	/** Raised while the one-shot recovery key is on screen. The account already
	 * exists by then and the words are stored nowhere, so the host must refuse
	 * any dismissal that would unmount this form. */
	onRecoveryPhraseVisible?: (visible: boolean) => void;
	onSwitchToSignIn?: () => void;
	random?: () => number;
}

export function RegisterForm({
	onSubmit,
	onComplete,
	onRecoveryPhraseVisible,
	onSwitchToSignIn,
	random,
}: RegisterFormProps) {
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [inviteToken, setInviteToken] = useState("");
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	// Real key material: it lives here only between registering and confirming,
	// and is dropped the moment the user confirms. Never persisted, never logged.
	const [phrase, setPhrase] = useState<string | null>(null);

	const ready = email.trim() !== "" && password !== "" && !busy;

	async function handleSubmit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (!ready) return;
		setBusy(true);
		setFailed(false);
		try {
			const recoveryPhrase = await onSubmit({
				email: email.trim(),
				password,
				...(inviteToken.trim() ? { inviteToken: inviteToken.trim() } : {}),
			});
			setPhrase(recoveryPhrase);
			onRecoveryPhraseVisible?.(true);
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	if (phrase !== null) {
		return (
			<RecoveryPhraseStep
				phrase={phrase}
				random={random}
				onConfirmed={() => {
					setPhrase(null);
					setPassword("");
					onRecoveryPhraseVisible?.(false);
					onComplete();
				}}
			/>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<label className="text-sm" htmlFor="sync-register-email">
					{t("sync.email")}
				</label>
				<Input
					id="sync-register-email"
					type="email"
					autoComplete="username"
					value={email}
					onChange={(e) => {
						setEmail(e.target.value);
						// The error describes credentials that were submitted, not ones being edited.
						setFailed(false);
					}}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<label className="text-sm" htmlFor="sync-register-password">
					{t("sync.password")}
				</label>
				<Input
					id="sync-register-password"
					type="password"
					autoComplete="new-password"
					value={password}
					onChange={(e) => {
						setPassword(e.target.value);
						setFailed(false);
					}}
				/>
				<p className="text-xs text-muted-foreground">
					{t("sync.passwordHint")}
				</p>
			</div>
			<div className="flex flex-col gap-1.5">
				<label className="text-sm" htmlFor="sync-register-invite">
					{t("sync.inviteToken")}
				</label>
				<Input
					id="sync-register-invite"
					autoComplete="off"
					value={inviteToken}
					onChange={(e) => {
						setInviteToken(e.target.value);
						setFailed(false);
					}}
				/>
				<p className="text-xs text-muted-foreground">
					{t("sync.inviteTokenHint")}
				</p>
			</div>

			{failed && (
				<p className="text-xs text-destructive">{t("sync.registerFailed")}</p>
			)}

			<div className="flex items-center justify-between gap-2">
				{onSwitchToSignIn ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onSwitchToSignIn}
					>
						{t("sync.signIn")}
					</Button>
				) : (
					<span />
				)}
				<Button type="submit" disabled={!ready}>
					{busy ? t("sync.creatingAccount") : t("sync.createAccount")}
				</Button>
			</div>
		</form>
	);
}
