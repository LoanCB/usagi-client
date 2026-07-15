import { useTranslation } from "react-i18next";
import { ChangelogList } from "@/components/layout/ChangelogList";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ChangelogVersion } from "@/types/changelog";

interface ChangelogDialogProps {
	readonly versions: readonly ChangelogVersion[];
	readonly onClose: () => void;
}

// Auto-shown after an update to surface what changed since the last visit.
export function ChangelogDialog({ versions, onClose }: ChangelogDialogProps) {
	const { t } = useTranslation();

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="flex flex-col h-[min(85vh,40rem)] max-h-[520px] sm:max-w-md">
				<DialogHeader className="border-b border-border pb-3">
					<DialogTitle>{t("changelog.popupTitle")}</DialogTitle>
					<DialogDescription>{t("changelog.popupSubtitle")}</DialogDescription>
				</DialogHeader>
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
					<ChangelogList versions={versions} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
