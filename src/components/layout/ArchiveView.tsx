import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";

export function ArchiveView() {
	const { archivedTasks, loadArchivedTasks, unarchiveTask, deleteTask } =
		useTaskStore();
	const projects = useProjectStore((s) => s.projects);
	const { t, i18n } = useTranslation();
	const repo = getRepository();
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	useEffect(() => {
		loadArchivedTasks(repo);
	}, []);

	return (
		<div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
			<div className="px-6 py-5 border-b border-border shrink-0">
				<h2 className="text-lg font-semibold">{t("nav.archives")}</h2>
			</div>
			<ScrollArea className="flex-1">
				{archivedTasks.length === 0 ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						{t("archive.empty")}
					</div>
				) : (
					<div className="flex flex-col gap-1 p-3">
						{archivedTasks.map((task) => {
							const project = projects.find((p) => p.id === task.projectId);
							return (
								<div
									key={task.id}
									className="flex items-center gap-3 mx-0 my-1 pl-3 pr-2 py-2.5 rounded-xl border glass-card"
								>
									<div className="flex-1 min-w-0">
										<p className="text-sm truncate line-through text-muted-foreground">
											{task.title}
										</p>
										<p className="text-xs text-muted-foreground/60 mt-0.5">
											{project?.name && (
												<span className="mr-2">{project.name}</span>
											)}
											{task.deletedAt &&
												t("archive.archivedOn", {
													date: formatDate(
														task.deletedAt.slice(0, 10),
														i18n.language,
													),
												})}
										</p>
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
										onClick={() => unarchiveTask(repo, task.id)}
										aria-label={t("task.restore")}
									>
										<RotateCcw className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
										onClick={() => setConfirmDeleteId(task.id)}
										aria-label={t("common.delete")}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							);
						})}
					</div>
				)}
			</ScrollArea>
			<ConfirmDeleteDialog
				open={confirmDeleteId !== null}
				onConfirm={async () => {
					if (confirmDeleteId) await deleteTask(repo, confirmDeleteId);
					setConfirmDeleteId(null);
				}}
				onCancel={() => setConfirmDeleteId(null)}
			/>
		</div>
	);
}
