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

interface WeakPasswordDialogProps {
	readonly open: boolean;
	readonly onConfirm: () => void;
	readonly onCancel: () => void;
}

export function WeakPasswordDialog({
	open,
	onConfirm,
	onCancel,
}: WeakPasswordDialogProps) {
	const { t } = useTranslation();
	return (
		<Dialog
			open={open}
			onOpenChange={(v) => !v && onCancel()}
			disablePointerDismissal
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("common.weakPasswordTitle")}</DialogTitle>
					<DialogDescription>
						{t("common.weakPasswordMessage")}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						{t("common.weakPasswordChange")}
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						{t("common.weakPasswordKeep")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
