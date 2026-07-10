import { RotateCcw, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchiveDateFilter } from "@/components/layout/ArchiveDateFilter";
import {
	type DateRange,
	inRange,
} from "@/components/layout/archive-date-range";
import { ProjectFilter } from "@/components/tasks/ProjectFilter";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { formatDate, todayIso } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";

// The four archive filters are one cohesive criteria object — they're always
// read together by the `filteredTasks` memo — so they live in a single reducer
// instead of four separate useState slices.
type ArchiveFilters = {
	search: string;
	projectIds: string[] | null; // null = all projects
	archivedRange: DateRange;
	dueRange: DateRange;
};

type ArchiveFilterAction =
	| { type: "setSearch"; value: string }
	| { type: "setProjects"; value: string[] | null }
	| { type: "setArchivedRange"; value: DateRange }
	| { type: "setDueRange"; value: DateRange };

const initialFilters: ArchiveFilters = {
	search: "",
	projectIds: null,
	archivedRange: { from: null, to: null },
	dueRange: { from: null, to: null },
};

function archiveFilterReducer(
	state: ArchiveFilters,
	action: ArchiveFilterAction,
): ArchiveFilters {
	switch (action.type) {
		case "setSearch":
			return { ...state, search: action.value };
		case "setProjects":
			return { ...state, projectIds: action.value };
		case "setArchivedRange":
			return { ...state, archivedRange: action.value };
		case "setDueRange":
			return { ...state, dueRange: action.value };
	}
}

export function ArchiveView() {
	const { archivedTasks, loadArchivedTasks, unarchiveTask, deleteTask } =
		useTaskStore();
	const projects = useProjectStore((s) => s.projects);
	const { t, i18n } = useTranslation();
	const repo = getRepository();
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [filters, dispatch] = useReducer(archiveFilterReducer, initialFilters);
	const {
		search,
		projectIds: filterProjectIds,
		archivedRange: archivedDateRange,
		dueRange: dueDateRange,
	} = filters;

	const today = useMemo(() => todayIso(), []);

	const filteredTasks = useMemo(() => {
		return archivedTasks.filter((task) => {
			const matchesSearch =
				!search.trim() ||
				task.title.toLowerCase().includes(search.toLowerCase());
			const matchesProject =
				filterProjectIds === null ||
				filterProjectIds.length === 0 ||
				filterProjectIds.some((id) =>
					id === INBOX_PROJECT_ID
						? task.projectId === null
						: task.projectId === id,
				);
			const archivedDate = task.deletedAt?.slice(0, 10) ?? null;
			const matchesArchivedDate = inRange(
				archivedDate,
				archivedDateRange,
				today,
			);
			const matchesDueDate = inRange(task.dueDate ?? null, dueDateRange, today);
			return (
				matchesSearch && matchesProject && matchesArchivedDate && matchesDueDate
			);
		});
	}, [
		archivedTasks,
		search,
		filterProjectIds,
		archivedDateRange,
		dueDateRange,
		today,
	]);

	useEffect(() => {
		loadArchivedTasks(repo);
	}, [loadArchivedTasks, repo]);

	return (
		<div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
			<div className="px-6 py-5 border-b border-border shrink-0 flex items-center gap-3">
				<h2 className="text-lg font-semibold flex-1">{t("nav.archives")}</h2>
				<div className="glass-stat flex items-center gap-2 rounded-xl px-3 py-1.5">
					<Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
					<input
						type="text"
						value={search}
						onChange={(e) =>
							dispatch({ type: "setSearch", value: e.target.value })
						}
						placeholder={t("task.search")}
						aria-label={t("task.search")}
						className="w-32 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
					/>
					<button
						type="button"
						onClick={() => dispatch({ type: "setSearch", value: "" })}
						className={`shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors ${search ? "visible" : "invisible"}`}
						aria-label="Clear search"
						tabIndex={search ? 0 : -1}
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
				<ProjectFilter
					value={filterProjectIds}
					onChange={(value) => dispatch({ type: "setProjects", value })}
				/>
				<ArchiveDateFilter
					archivedRange={archivedDateRange}
					onArchivedRangeChange={(value) =>
						dispatch({ type: "setArchivedRange", value })
					}
					dueDateRange={dueDateRange}
					onDueDateRangeChange={(value) =>
						dispatch({ type: "setDueRange", value })
					}
				/>
			</div>
			<ScrollArea className="flex-1 min-h-0">
				{archivedTasks.length === 0 ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						{t("archive.empty")}
					</div>
				) : filteredTasks.length === 0 ? (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						{t("archive.noResults")}
					</div>
				) : (
					<div className="flex flex-col gap-1 p-3">
						{filteredTasks.map((task) => {
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
												<>
													<span>{project.name}</span>
													<span className="mx-1.5">·</span>
												</>
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
