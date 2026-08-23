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
import type { ExportData } from "@/lib/dataTransfer";
import { cn } from "@/lib/utils";

interface ImportConfirmDialogProps {
	readonly data: ExportData;
	readonly onConfirm: (strategy: "merge" | "replace") => void;
	readonly onCancel: () => void;
}

export function ImportConfirmDialog({
	data,
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
