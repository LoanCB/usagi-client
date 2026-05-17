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

interface ConfirmDeleteDialogProps {
	readonly open: boolean;
	readonly onConfirm: () => void;
	readonly onCancel: () => void;
}

export function ConfirmDeleteDialog({
	open,
	onConfirm,
	onCancel,
}: ConfirmDeleteDialogProps) {
	const { t } = useTranslation();
	return (
		<Dialog open={open} onOpenChange={(v) => !v && onCancel()} disablePointerDismissal>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("common.deleteConfirmTitle")}</DialogTitle>
					<DialogDescription>
						{t("common.deleteConfirmMessage")}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						{t("common.cancel")}
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						{t("common.delete")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
