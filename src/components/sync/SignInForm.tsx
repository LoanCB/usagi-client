import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SignInFormProps {
	onSubmit: (input: { email: string; password: string }) => Promise<void>;
	onSwitchToRegister?: () => void;
}

export function SignInForm({ onSubmit, onSwitchToRegister }: SignInFormProps) {
	const { t } = useTranslation();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);

	const ready = email.trim() !== "" && password !== "" && !busy;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!ready) return;
		setBusy(true);
		setFailed(false);
		try {
			await onSubmit({ email: email.trim(), password });
		} catch {
			// Every sign-in failure reads the same to the user: a 401 and an
			// unreachable server both mean "you are not in", and distinguishing
			// them here would leak which emails exist.
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<label className="text-sm" htmlFor="sync-signin-email">
					{t("sync.email")}
				</label>
				<Input
					id="sync-signin-email"
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
				<label className="text-sm" htmlFor="sync-signin-password">
					{t("sync.password")}
				</label>
				<Input
					id="sync-signin-password"
					type="password"
					autoComplete="current-password"
					value={password}
					onChange={(e) => {
						setPassword(e.target.value);
						setFailed(false);
					}}
				/>
			</div>

			{failed && (
				<p className="text-xs text-destructive">{t("sync.signInFailed")}</p>
			)}

			<div className="flex items-center justify-between gap-2">
				{onSwitchToRegister ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onSwitchToRegister}
					>
						{t("sync.createAccount")}
					</Button>
				) : (
					<span />
				)}
				<Button type="submit" disabled={!ready}>
					{busy ? t("sync.signingIn") : t("sync.signIn")}
				</Button>
			</div>
		</form>
	);
}
