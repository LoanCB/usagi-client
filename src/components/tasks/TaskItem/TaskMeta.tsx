import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import type { Tag } from "@/types";

interface TaskMetaProps {
	readonly dueDate: string | null;
	readonly tags: readonly Tag[];
	readonly colorblindMode: boolean;
}

export function TaskMeta({ dueDate, tags, colorblindMode }: TaskMetaProps) {
	const { i18n } = useTranslation();

	return (
		<>
			{dueDate && (
				<span className="flex items-center gap-1 shrink-0">
					{isOverdue(dueDate) && (
						<TriangleAlert className="h-3.5 w-3.5 text-[var(--priority-high)]" />
					)}
					<span
						className={cn(
							"text-xs",
							isOverdue(dueDate)
								? "text-[var(--priority-high)]"
								: "text-muted-foreground",
							isOverdue(dueDate) && colorblindMode && "underline font-semibold",
						)}
					>
						{formatDate(dueDate, i18n.language)}
					</span>
				</span>
			)}
			{tags.slice(0, 2).map((tag) => (
				<Badge
					key={tag.id}
					variant="secondary"
					className="text-xs shrink-0 h-5 flex items-center gap-1"
					style={
						tag.color
							? {
									backgroundColor: `${tag.color}28`,
									color: tag.color,
									borderColor: `${tag.color}50`,
								}
							: undefined
					}
				>
					{colorblindMode && tag.color && (
						<GroupColorShape color={tag.color} size={8} className="shrink-0" />
					)}
					{tag.name}
				</Badge>
			))}
			{tags.length > 2 && (
				<Badge variant="secondary" className="text-xs shrink-0 h-5">
					+{tags.length - 2}
				</Badge>
			)}
		</>
	);
}
