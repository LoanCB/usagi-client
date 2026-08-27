import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSyncStore } from "@/store/sync";
import type { SyncDevice } from "@/sync/devices-types";
import { SyncNetworkError } from "@/sync/http";
import { type ServerInfo, SyncUnlockOfflineError } from "@/sync/types";
import { ConnectedPanel } from "./ConnectedPanel";
import { RegisterForm } from "./RegisterForm";
import { ServerUrlForm } from "./ServerUrlForm";
import { SignInForm } from "./SignInForm";
import { UnlockDialog } from "./UnlockDialog";

export interface SyncSession {
	accountEmail: string;
	serverUrl: string;
}

/** Every side effect the panel needs, injected so it renders under vitest
 * without a Tauri runtime, a database or a network. */
export interface SyncPanelDeps {
	loadSession: () => Promise<SyncSession | null>;
	probe: (url: string) => Promise<ServerInfo>;
	signIn: (input: {
		serverUrl: string;
		email: string;
		password: string;
	}) => Promise<void>;
	register: (input: {
		serverUrl: string;
		email: string;
		password: string;
		inviteToken?: string;
	}) => Promise<string>;
	signOut: () => Promise<void>;
	unlock: (password: string) => Promise<void>;
	syncNow: () => Promise<void>;
	listDevices: () => Promise<SyncDevice[]>;
	revokeDevice: (id: string) => Promise<void>;
}

type Screen =
	| { kind: "loading" }
	| { kind: "server" }
	| {
			kind: "credentials";
			url: string;
			info: ServerInfo;
			mode: "sign-in" | "register";
	  }
	| { kind: "connected"; session: SyncSession };

export function SyncPanel({
	deps,
	onDismissBlockedChange,
}: {
	deps: SyncPanelDeps;
	/** Raised while the panel shows something that dismissing would destroy —
	 * today the one-shot recovery key. The host dialog must refuse to close. */
	onDismissBlockedChange?: (blocked: boolean) => void;
}) {
	const { t } = useTranslation();
	const status = useSyncStore((s) => s.status);
	const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
	const [screen, setScreen] = useState<Screen>({ kind: "loading" });
	const [unlocking, setUnlocking] = useState(false);
	const [reauthing, setReauthing] = useState(false);

	const loadSession = deps.loadSession;
	useEffect(() => {
		let cancelled = false;
		void loadSession().then((session) => {
			if (cancelled) return;
			// Only ever settle the initial "loading" screen. Should this effect run
			// again (a caller handing over a new deps identity), clobbering the
			// current screen would discard a verified server, typed credentials —
			// or a displayed 24-word recovery key, which exists nowhere else.
			setScreen((current) =>
				current.kind === "loading"
					? session
						? { kind: "connected", session }
						: { kind: "server" }
					: current,
			);
		});
		return () => {
			cancelled = true;
		};
	}, [loadSession]);

	// Unmounting with the guard still raised would leave the host dialog
	// permanently undismissable, so release it whatever the exit path.
	useEffect(
		() => () => onDismissBlockedChange?.(false),
		[onDismissBlockedChange],
	);

	const handleDisconnect = useCallback(async () => {
		await deps.signOut();
		setScreen({ kind: "server" });
	}, [deps]);

	const session = screen.kind === "connected" ? screen.session : null;
	const signIn = deps.signIn;
	const handleReauth = useCallback(
		async (password: string) => {
			if (!session) return;
			try {
				await signIn({
					serverUrl: session.serverUrl,
					email: session.accountEmail,
					password,
				});
			} catch (err) {
				// Same reasoning as the unlock path: an unreachable server must not
				// be reported as a bad password.
				if (err instanceof SyncNetworkError) throw new SyncUnlockOfflineError();
				throw err;
			}
		},
		[session, signIn],
	);

	if (screen.kind === "loading") return <div className="py-4" />;

	if (screen.kind === "connected") {
		return (
			<>
				<ConnectedPanel
					accountEmail={screen.session.accountEmail}
					serverUrl={screen.session.serverUrl}
					status={status ?? "idle"}
					lastSyncAt={lastSyncAt}
					onSyncNow={deps.syncNow}
					onDisconnect={handleDisconnect}
					onUnlock={() => setUnlocking(true)}
					onReauth={() => setReauthing(true)}
					devices={{ load: deps.listDevices, revoke: deps.revokeDevice }}
				/>
				<UnlockDialog
					open={unlocking}
					onOpenChange={setUnlocking}
					onUnlock={deps.unlock}
				/>
				<UnlockDialog
					mode="reauth"
					open={reauthing}
					onOpenChange={setReauthing}
					onUnlock={handleReauth}
				/>
			</>
		);
	}

	return (
		<div className="flex flex-col gap-4 py-4">
			<p className="text-xs text-muted-foreground">{t("sync.intro")}</p>

			<ServerUrlForm
				probe={deps.probe}
				onVerified={(url, info) =>
					setScreen({ kind: "credentials", url, info, mode: "sign-in" })
				}
			/>

			{screen.kind === "credentials" && (
				<div className="border-t border-border pt-4">
					{screen.mode === "sign-in" ? (
						<>
							<SignInForm
								onSubmit={async ({ email, password }) => {
									await deps.signIn({ serverUrl: screen.url, email, password });
									setScreen({
										kind: "connected",
										session: { accountEmail: email, serverUrl: screen.url },
									});
								}}
								onSwitchToRegister={
									screen.info.registrationEnabled
										? () => setScreen({ ...screen, mode: "register" })
										: undefined
								}
							/>
							{!screen.info.registrationEnabled && (
								<p className="mt-2 text-xs text-muted-foreground">
									{t("sync.registrationClosed")}
								</p>
							)}
						</>
					) : (
						<RegisterForm
							onSubmit={({ email, password, inviteToken }) =>
								deps.register({
									serverUrl: screen.url,
									email,
									password,
									inviteToken,
								})
							}
							onRecoveryPhraseVisible={onDismissBlockedChange}
							onComplete={() => {
								// persistSession has just written account_email to sync_state:
								// re-read it rather than threading the just-typed email through
								// React state, so the panel renders from the source of truth.
								void deps.loadSession().then((session) => {
									setScreen(
										session
											? { kind: "connected", session }
											: { kind: "server" },
									);
								});
							}}
							onSwitchToSignIn={() => setScreen({ ...screen, mode: "sign-in" })}
						/>
					)}
				</div>
			)}
		</div>
	);
}
