import { AlertTriangle } from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface FirstSyncDialogProps {
	open: boolean;
	/** Writes the automatic JSON backup. Rejecting MUST abort a replace. */
	backup: () => Promise<void>;
	resolve: (choice: "merge" | "replace") => Promise<void>;
	onResolved: () => void;
}

type Phase = "choosing" | "backing-up" | "applying";

export function FirstSyncDialog({
	open,
	backup,
	resolve,
	onResolved,
}: FirstSyncDialogProps) {
	const { t } = useTranslation();
	const [choice, setChoice] = useState<"merge" | "replace">("merge");
	const [phase, setPhase] = useState<Phase>("choosing");
	const [backupFailed, setBackupFailed] = useState(false);
	const [applyFailed, setApplyFailed] = useState(false);

	function selectChoice(option: "merge" | "replace") {
		setChoice(option);
		// A stale "backup could not be saved" would be misleading under Merge,
		// which never backs up; and switching away from a failed attempt is a
		// fresh try, so drop both error states on any change of mind.
		setBackupFailed(false);
		setApplyFailed(false);
	}

	async function handleConfirm() {
		setBackupFailed(false);
		setApplyFailed(false);

		if (choice === "replace") {
			setPhase("backing-up");
			try {
				await backup();
			} catch {
				// §6.4: the backup is what makes "replace" recoverable. Without it
				// the destructive branch must not run at all.
				setBackupFailed(true);
				setPhase("choosing");
				return;
			}
		}

		setPhase("applying");
		try {
			await resolve(choice);
		} catch {
			setApplyFailed(true);
			setPhase("choosing");
			return;
		}
		onResolved();
	}

	const busy = phase !== "choosing";

	return (
		// No onOpenChange: the engine stays suspended until this is answered, so
		// there is no dismissing it.
		<Dialog open={open}>
			<DialogContent role="alertdialog" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{t("sync.firstSync.title")}</DialogTitle>
				</DialogHeader>
				<DialogDescription>{t("sync.firstSync.intro")}</DialogDescription>

				<div className="flex gap-2">
					{(["merge", "replace"] as const).map((option) => (
						<Button
							key={option}
							type="button"
							variant={choice === option ? "default" : "outline"}
							disabled={busy}
							className={cn("flex-1")}
							onClick={() => selectChoice(option)}
						>
							{t(`sync.firstSync.${option}`)}
						</Button>
					))}
				</div>

				<p className="text-xs text-muted-foreground">
					{t(`sync.firstSync.${choice}Explanation`)}
				</p>

				{choice === "replace" && (
					<p className="flex items-center gap-1.5 text-xs text-destructive">
						<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
						{t("sync.firstSync.replaceWarning")}
					</p>
				)}

				{backupFailed && (
					<p className="text-xs text-destructive">
						{t("sync.firstSync.backupFailed")}
					</p>
				)}
				{applyFailed && (
					<p className="text-xs text-destructive">
						{t("sync.firstSync.failed")}
					</p>
				)}

				<DialogFooter>
					<Button type="button" disabled={busy} onClick={handleConfirm}>
						{phase === "backing-up"
							? t("sync.firstSync.backupSaving")
							: phase === "applying"
								? t("sync.firstSync.applying")
								: t("sync.firstSync.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
