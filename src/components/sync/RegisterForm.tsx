import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecoveryPhraseStep } from "./RecoveryPhraseStep";
import { registerErrorMessage } from "./register-error";

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
	/** The server has open registration off: an invite token is then the only
	 * way to create an account, so the form refuses to submit without one. */
	inviteRequired?: boolean;
	/** The vault has its own password, which connecting will replace (§4). */
	replacesLocalPassword?: boolean;
	random?: () => number;
}

export function RegisterForm({
	onSubmit,
	onComplete,
	onRecoveryPhraseVisible,
	onSwitchToSignIn,
	inviteRequired = false,
	replacesLocalPassword = false,
	random,
}: RegisterFormProps) {
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [inviteToken, setInviteToken] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Real key material: it lives here only between registering and confirming,
	// and is dropped the moment the user confirms. Never persisted, never logged.
	const [phrase, setPhrase] = useState<string | null>(null);

	const ready =
		email.trim() !== "" &&
		password !== "" &&
		(!inviteRequired || inviteToken.trim() !== "") &&
		!busy;

	async function handleSubmit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (!ready) return;
		setBusy(true);
		setError(null);
		try {
			const recoveryPhrase = await onSubmit({
				email: email.trim(),
				password,
				...(inviteToken.trim() ? { inviteToken: inviteToken.trim() } : {}),
			});
			setPhrase(recoveryPhrase);
			onRecoveryPhraseVisible?.(true);
		} catch (err) {
			setError(registerErrorMessage(t, err, inviteToken.trim() !== ""));
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
						setError(null);
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
						setError(null);
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
						setError(null);
					}}
				/>
				<p className="text-xs text-muted-foreground">
					{t(
						inviteRequired
							? "sync.inviteTokenRequiredHint"
							: "sync.inviteTokenHint",
					)}
				</p>
			</div>

			{replacesLocalPassword && (
				<p className="text-xs text-muted-foreground">
					{t("sync.localPasswordReplaced")}
				</p>
			)}

			{error && <p className="text-xs text-destructive">{error}</p>}

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
