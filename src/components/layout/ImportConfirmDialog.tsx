import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ImportGaps } from "@/db/import-resolution";
import { hasImportGaps } from "@/db/import-resolution";
import type { ExportData } from "@/lib/dataTransfer";
import { cn } from "@/lib/utils";

interface ImportConfirmDialogProps {
	readonly data: ExportData;
	/**
	 * What the import would have to change to fit this device, per mode.
	 *
	 * Both modes are precomputed because the mode is chosen in here, and a
	 * replace tombstones the projects the backup leaves out — so it can send
	 * tasks to the Inbox that a merge of the same file would leave alone.
	 */
	readonly gaps: Record<"merge" | "replace", ImportGaps>;
	readonly onConfirm: (strategy: "merge" | "replace") => void;
	readonly onCancel: () => void;
}

export function ImportConfirmDialog({
	data,
	gaps,
	onConfirm,
	onCancel,
}: ImportConfirmDialogProps) {
	const { t } = useTranslation();
	// Mode is picked first and confirmed separately: under sync, replace
	// rewrites other devices, so the user must see the consequence before
	// bulkImport is ever called, not merely by hovering a button.
	const [mode, setMode] = useState<"merge" | "replace">("merge");

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent role="alertdialog" className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{t("data.importConfirmTitle")}</DialogTitle>
				</DialogHeader>

				<DialogDescription>
					{t("data.importSummary", {
						tasks: data.tasks.length,
						projects: data.projects.length,
						tags: data.tags.length,
					})}
				</DialogDescription>

				<div className="flex flex-col gap-2 pt-2">
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							aria-pressed={mode === "merge"}
							className={cn(mode === "merge" && "bg-muted text-foreground")}
							onClick={() => setMode("merge")}
						>
							{t("data.merge")}
						</Button>
						<Button
							type="button"
							variant="outline"
							aria-pressed={mode === "replace"}
							className={cn(
								mode === "replace" && "bg-destructive/10 text-destructive",
							)}
							onClick={() => setMode("replace")}
						>
							{t("data.replace")}
						</Button>
					</div>

					<p className="text-xs text-muted-foreground">
						{mode === "merge"
							? t("data.mergeExplanation")
							: t("data.replaceExplanation")}
					</p>

					{mode === "replace" && (
						<p className="flex items-center gap-1.5 text-xs text-destructive">
							<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
							{t("data.replaceWarning")}
						</p>
					)}

					{hasImportGaps(gaps[mode]) && (
						<div className="flex gap-1.5 rounded-md bg-muted p-2 text-xs">
							<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							<div className="flex flex-col gap-1">
								<p className="font-medium">{t("data.importGapsTitle")}</p>
								{gaps[mode].inboxedTasks > 0 && (
									<p className="text-muted-foreground">
										{t("data.importGapsInboxedTasks", {
											count: gaps[mode].inboxedTasks,
										})}
									</p>
								)}
								{gaps[mode].unscopedTags > 0 && (
									<p className="text-muted-foreground">
										{t("data.importGapsUnscopedTags", {
											count: gaps[mode].unscopedTags,
										})}
									</p>
								)}
								{gaps[mode].droppedTagLinks > 0 && (
									<p className="text-muted-foreground">
										{t("data.importGapsDroppedTagLinks", {
											count: gaps[mode].droppedTagLinks,
										})}
									</p>
								)}
							</div>
						</div>
					)}
				</div>

				<Button
					variant={mode === "replace" ? "destructive" : "default"}
					onClick={() => onConfirm(mode)}
				>
					{t("data.importConfirm")}
				</Button>

				<Button
					variant="ghost"
					size="sm"
					className="mt-1 text-muted-foreground"
					onClick={onCancel}
				>
					{t("common.cancel")}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
