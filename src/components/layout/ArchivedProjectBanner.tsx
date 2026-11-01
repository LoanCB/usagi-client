import { Archive, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useArchiveStore } from "@/store/archives";
import { getRepository } from "@/store/repository";
import type { Project } from "@/types";

export function ArchivedProjectBanner({
	project,
}: {
	readonly project: Project;
}) {
	const { t } = useTranslation();
	const group = useArchiveStore((s) =>
		s.groups.find((g) => g.id === project.groupId),
	);
	const restoreProject = useArchiveStore((s) => s.restoreProject);
	const restoreGroup = useArchiveStore((s) => s.restoreGroup);

	function handleRestore() {
		const repo = getRepository();
		if (group) restoreGroup(repo, group.id);
		else restoreProject(repo, project.id);
	}

	return (
		<div
			role="status"
			className="flex items-center gap-2 mx-5 my-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
		>
			<Archive className="h-4 w-4 shrink-0" />
			<span className="flex-1 min-w-0">
				{t(group ? "archive.groupBanner" : "archive.projectBanner")}
			</span>
			<Button
				variant="ghost"
				size="sm"
				className="gap-2 shrink-0"
				onClick={handleRestore}
			>
				<RotateCcw className="h-3.5 w-3.5" />
				{t(group ? "archive.restoreGroup" : "archive.restoreProject")}
			</Button>
		</div>
	);
}
