import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSyncStore } from "@/store/sync";
import type { SyncStatus } from "@/sync/types";
import type { SettingsTab } from "@/types/settings-tab";

export interface SyncStatusBannerProps {
	onOpenSettings: (tab: SettingsTab) => void;
}

/** §7: only the states the user has to act on. idle, syncing and
 * awaiting-first-sync are handled elsewhere (the panel, the first-sync dialog)
 * and a banner for them would be noise — but they are spelled out rather than
 * omitted, so a seventh SyncStatus fails to compile here instead of silently
 * rendering nothing. */
const ACTIONABLE = {
	idle: null,
	syncing: null,
	"awaiting-first-sync": null,
	locked: "sync.banner.locked",
	"reauth-required": "sync.banner.reauthRequired",
	"protocol-mismatch": "sync.banner.protocolMismatch",
} as const satisfies Record<SyncStatus, string | null>;

type ActionableStatus = {
	[K in SyncStatus]: (typeof ACTIONABLE)[K] extends null ? never : K;
}[SyncStatus];

function isActionable(status: SyncStatus | null): status is ActionableStatus {
	return status !== null && ACTIONABLE[status] !== null;
}

export function SyncStatusBanner({ onOpenSettings }: SyncStatusBannerProps) {
	const { t } = useTranslation();
	const status = useSyncStore((s) => s.status);

	if (!isActionable(status)) return null;

	return (
		<div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2">
			<p className="flex items-center gap-1.5 text-xs text-destructive">
				<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
				{t(ACTIONABLE[status])}
			</p>
			<Button
				type="button"
				variant="outline"
				size="sm"
				// Settings opens on Sync: this banner is the only route to unlocking
				// a locked vault, and the General tab is a click short of it.
				onClick={() => onOpenSettings("sync")}
			>
				{t("sync.banner.action")}
			</Button>
		</div>
	);
}
