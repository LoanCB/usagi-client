import { Archive, Copy, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroupLabel,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import type { Tag } from "@/types";

interface TaskContextMenuProps {
	readonly taskTagIds: readonly string[];
	readonly visibleTags: readonly Tag[];
	readonly onCopyTitle: () => void;
	readonly onEditTitle: () => void;
	readonly onArchive: () => void;
	readonly onDelete: () => void;
	readonly onTagToggle: (tagId: string, checked: boolean) => void;
}

export function TaskContextMenu({
	taskTagIds,
	visibleTags,
	onCopyTitle,
	onEditTitle,
	onArchive,
	onDelete,
	onTagToggle,
}: TaskContextMenuProps) {
	const { t } = useTranslation();

	return (
		<ContextMenuContent>
			<ContextMenuItem onClick={onCopyTitle}>
				<Copy className="h-4 w-4" />
				{t("task.copyTitle")}
			</ContextMenuItem>
			<ContextMenuItem onClick={onEditTitle}>
				<Pencil className="h-4 w-4" />
				{t("task.rename")}
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onArchive}>
				<Archive className="h-4 w-4" />
				{t("task.archive")}
			</ContextMenuItem>
			<ContextMenuItem
				variant="destructive"
				closeOnClick={false}
				onClick={onDelete}
			>
				<Trash2 className="h-4 w-4" />
				{t("common.delete")}
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuGroupLabel>{t("tag.tags")}</ContextMenuGroupLabel>
			{visibleTags.length === 0 ? (
				<p className="px-1.5 py-1 text-xs text-muted-foreground">
					{t("tag.noTags")}
				</p>
			) : (
				visibleTags.map((tag) => (
					<ContextMenuCheckboxItem
						key={tag.id}
						checked={taskTagIds.includes(tag.id)}
						onCheckedChange={(checked) => onTagToggle(tag.id, checked)}
					>
						<GroupColorShape
							color={tag.color ?? "var(--muted-foreground)"}
							size={8}
							className="shrink-0"
						/>
						<span className="truncate">{tag.name}</span>
					</ContextMenuCheckboxItem>
				))
			)}
		</ContextMenuContent>
	);
}
