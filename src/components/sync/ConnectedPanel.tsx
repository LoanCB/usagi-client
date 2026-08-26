import { useState } from "react";
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
import type { SyncStatus } from "@/sync/types";
import { DeviceList, type DeviceListProps } from "./DeviceList";

export interface ConnectedPanelProps {
	accountEmail: string;
	serverUrl: string;
	status: SyncStatus;
	lastSyncAt: string | null;
	onSyncNow: () => Promise<void>;
	onDisconnect: () => Promise<void>;
	onUnlock: () => void;
	devices: DeviceListProps;
}

/** SyncStatus is kebab-case, the i18n keys are camelCase. `satisfies` (rather
 * than `: Record<...>`) keeps each value's literal type, which the typed
 * i18next `t()` needs to resolve `sync.status.${...}` to a known key. */
const STATUS_KEY = {
	idle: "idle",
	syncing: "syncing",
	locked: "locked",
	"awaiting-first-sync": "awaitingFirstSync",
	"reauth-required": "reauthRequired",
	"protocol-mismatch": "protocolMismatch",
} as const satisfies Record<SyncStatus, string>;

export function ConnectedPanel({
	accountEmail,
	serverUrl,
	status,
	lastSyncAt,
	onSyncNow,
	onDisconnect,
	onUnlock,
	devices,
}: ConnectedPanelProps) {
	const { t, i18n } = useTranslation();
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [syncing, setSyncing] = useState(false);

	async function handleDisconnect() {
		setBusy(true);
		try {
			await onDisconnect();
			setConfirming(false);
		} finally {
			setBusy(false);
		}
	}

	async function handleSyncNow() {
		setSyncing(true);
		try {
			await onSyncNow();
		} finally {
			setSyncing(false);
		}
	}

	return (
		<div className="flex flex-col gap-4 py-4">
			<div className="flex flex-col gap-1">
				<p className="text-xs text-muted-foreground">{t("sync.account")}</p>
				<p className="text-sm">{accountEmail}</p>
				<p className="text-xs text-muted-foreground">{serverUrl}</p>
			</div>

			<div className="flex flex-col gap-1">
				<p className="text-xs text-muted-foreground">
					{t("sync.status.label")}
				</p>
				<p className="text-sm">{t(`sync.status.${STATUS_KEY[status]}`)}</p>
				<p className="text-xs text-muted-foreground">
					{t("sync.lastSync")} —{" "}
					<span>
						{lastSyncAt
							? new Date(lastSyncAt).toLocaleString(i18n.language)
							: t("sync.never")}
					</span>
				</p>
			</div>

			<div className="flex gap-2">
				{status === "locked" ? (
					// Syncing is pointless while the vault is shut: the engine would
					// return straight away. Offer the action that actually unblocks.
					<Button type="button" onClick={onUnlock}>
						{t("sync.unlock.submit")}
					</Button>
				) : (
					<Button
						type="button"
						variant="outline"
						disabled={syncing || status === "syncing"}
						onClick={handleSyncNow}
					>
						{t("sync.syncNow")}
					</Button>
				)}
			</div>

			<DeviceList {...devices} />

			<div className="flex flex-col gap-2 border-t border-border pt-4">
				<p className="text-xs text-muted-foreground">
					{t("sync.changeServerHint")}
				</p>
				<div>
					<Button
						type="button"
						variant="destructive"
						onClick={() => setConfirming(true)}
					>
						{t("sync.disconnect")}
					</Button>
				</div>
			</div>

			<Dialog
				open={confirming}
				onOpenChange={(open) => !open && setConfirming(false)}
			>
				<DialogContent role="alertdialog">
					<DialogHeader>
						<DialogTitle>{t("sync.disconnectConfirmTitle")}</DialogTitle>
					</DialogHeader>
					<DialogDescription>
						{t("sync.disconnectConfirmMessage")}
					</DialogDescription>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirming(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={busy}
							onClick={handleDisconnect}
						>
							{busy ? t("sync.disconnecting") : t("sync.disconnectShort")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
