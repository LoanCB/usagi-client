import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSyncStore } from "@/store/sync";
import type { SyncStatus } from "@/sync/types";

export interface SyncStatusBannerProps {
	onOpenSettings: () => void;
}

/** §7: only the states the user has to act on. idle, syncing and
 * awaiting-first-sync are handled elsewhere (the panel, the first-sync dialog)
 * and a banner for them would be noise. */
const ACTIONABLE = {
	locked: "sync.banner.locked",
	"reauth-required": "sync.banner.reauthRequired",
	"protocol-mismatch": "sync.banner.protocolMismatch",
} as const satisfies Partial<Record<SyncStatus, string>>;

type ActionableStatus = keyof typeof ACTIONABLE;

function isActionable(status: SyncStatus | null): status is ActionableStatus {
	return status !== null && status in ACTIONABLE;
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
				onClick={onOpenSettings}
			>
				{t("sync.banner.action")}
			</Button>
		</div>
	);
}
