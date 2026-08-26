import { useCallback, useEffect, useState } from "react";
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
import type { SyncDevice } from "@/sync/devices-types";

export interface DeviceListProps {
	load: () => Promise<SyncDevice[]>;
	revoke: (id: string) => Promise<void>;
}

export function DeviceList({ load, revoke }: DeviceListProps) {
	const { t, i18n } = useTranslation();
	const [devices, setDevices] = useState<SyncDevice[]>([]);
	const [loadFailed, setLoadFailed] = useState(false);
	const [pending, setPending] = useState<SyncDevice | null>(null);
	const [revoking, setRevoking] = useState(false);
	const [revokeFailed, setRevokeFailed] = useState(false);

	const refresh = useCallback(async () => {
		try {
			setDevices(await load());
			setLoadFailed(false);
		} catch {
			setLoadFailed(true);
		}
	}, [load]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	function closeDialog() {
		setPending(null);
		// Clear the previous failure now, not just on next success: otherwise
		// reopening the dialog for a different device could show a stale
		// "could not revoke" left over from an earlier one.
		setRevokeFailed(false);
	}

	async function handleRevoke() {
		if (!pending) return;
		setRevoking(true);
		setRevokeFailed(false);
		try {
			await revoke(pending.id);
			setPending(null);
			await refresh();
		} catch {
			// A 404 means "not this account's device" — the server never answers
			// 403, so a failure reads the same either way.
			setRevokeFailed(true);
		} finally {
			setRevoking(false);
		}
	}

	function lastSeen(device: SyncDevice): string {
		if (!device.lastSeenAt) return t("sync.devices.never");
		return t("sync.devices.lastSeen", {
			when: new Date(device.lastSeenAt).toLocaleString(i18n.language),
		});
	}

	const others = devices.filter((d) => !d.current);

	return (
		<div className="flex flex-col gap-2">
			<p className="text-sm font-medium">{t("sync.devices.title")}</p>
			{loadFailed && (
				<p className="text-xs text-destructive">
					{t("sync.devices.loadFailed")}
				</p>
			)}
			{!loadFailed && devices.length > 0 && others.length === 0 && (
				<p className="text-xs text-muted-foreground">
					{t("sync.devices.empty")}
				</p>
			)}
			<ul className="flex flex-col gap-1">
				{devices.map((device) => (
					<li
						key={device.id}
						className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
					>
						<div className="min-w-0">
							<p className="truncate text-sm">
								{device.name}
								{device.current && (
									<span className="ml-2 text-xs text-muted-foreground">
										{t("sync.devices.thisDevice")}
									</span>
								)}
							</p>
							<p className="text-xs text-muted-foreground">
								{device.platform} — {lastSeen(device)}
							</p>
						</div>
						{!device.current && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setPending(device)}
							>
								{t("sync.devices.revoke")}
							</Button>
						)}
					</li>
				))}
			</ul>

			<Dialog
				open={pending !== null}
				onOpenChange={(open) => !open && closeDialog()}
			>
				<DialogContent role="alertdialog">
					<DialogHeader>
						<DialogTitle>{t("sync.devices.revokeConfirmTitle")}</DialogTitle>
					</DialogHeader>
					<DialogDescription>
						{t("sync.devices.revokeConfirmMessage", {
							name: pending?.name ?? "",
						})}
					</DialogDescription>
					{revokeFailed && (
						<p className="text-xs text-destructive">
							{t("sync.devices.revokeFailed")}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={closeDialog}>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={revoking}
							onClick={handleRevoke}
						>
							{revoking
								? t("sync.devices.revoking")
								: t("sync.devices.revokeShort")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
