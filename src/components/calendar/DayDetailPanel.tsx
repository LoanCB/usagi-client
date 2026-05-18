import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { QuickAddTask } from "@/components/tasks/QuickAddTask";
import type { Project, Task } from "@/types";

interface DayDetailPanelProps {
	readonly day: string;
	readonly entry: { due: Task[]; completed: Task[] } | undefined;
	readonly width: number;
	readonly onClose: () => void;
	readonly onTaskClick: (task: Task) => void;
	readonly focusTrigger?: number;
	readonly projectFilter?: string | null;
	readonly projects: Project[];
}

export function DayDetailPanel({
	day,
	entry,
	width,
	onClose,
	onTaskClick,
	focusTrigger,
	projectFilter,
	projects,
}: DayDetailPanelProps) {
	const { t, i18n } = useTranslation();
	const locale = i18n.language === "fr" ? fr : enUS;

	const date = new Date(`${day}T00:00:00`);
	const due = entry?.due ?? [];
	const completed = entry?.completed ?? [];
	const hasAny = due.length > 0 || completed.length > 0;

	const distinctProjectIds = new Set([
		...due.map((t) => t.projectId),
		...completed.map((t) => t.projectId),
	]);
	const isMultiProject = distinctProjectIds.size > 1;

	const projectGroups: {
		projectId: string | null;
		due: Task[];
		completed: Task[];
	}[] = isMultiProject
		? (() => {
				const map = new Map<
					string | null,
					{ due: Task[]; completed: Task[] }
				>();
				for (const task of due) {
					const pid = task.projectId;
					let group = map.get(pid);
					if (!group) {
						group = { due: [], completed: [] };
						map.set(pid, group);
					}
					group.due.push(task);
				}
				for (const task of completed) {
					const pid = task.projectId;
					let group = map.get(pid);
					if (!group) {
						group = { due: [], completed: [] };
						map.set(pid, group);
					}
					group.completed.push(task);
				}
				const ids = [...map.keys()];
				ids.sort((a, b) => {
					if (a === null) return 1;
					if (b === null) return -1;
					const pa = projects.find((p) => p.id === a)?.sortOrder ?? 0;
					const pb = projects.find((p) => p.id === b)?.sortOrder ?? 0;
					return pa - pb;
				});
				return ids.map((pid) => ({
					projectId: pid,
					...(map.get(pid) ?? { due: [], completed: [] }),
				}));
			})()
		: [];

	return (
		<div
			className="flex flex-col shrink-0 border-l border-border/40 overflow-hidden"
			style={{ width }}
		>
			<div className="glass-header px-4 py-3 shrink-0 flex items-center justify-between">
				<span className="text-sm font-semibold capitalize">
					{format(date, "EEEE d MMMM yyyy", { locale })}
				</span>
				<button
					type="button"
					aria-label={t("calendar.closeDay")}
					onClick={onClose}
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="flex flex-col flex-1 overflow-y-auto px-3 py-2 gap-1">
				{!hasAny && (
					<p className="text-xs text-muted-foreground/60 text-center py-4">
						{t("calendar.noTasks")}
					</p>
				)}

				{isMultiProject ? (
					projectGroups.map((group, i) => {
						const project = projects.find((p) => p.id === group.projectId);
						const isInbox = group.projectId === null;
						return (
							<div
								key={group.projectId ?? "inbox"}
								className={i > 0 ? "mt-2" : undefined}
							>
								<div className="flex items-center gap-1.5 px-1 mb-1">
									{!isInbox && (
										<span
											className="inline-block w-2 h-2 rounded-full shrink-0"
											style={{ backgroundColor: project?.color ?? "#888" }}
										/>
									)}
									<span className="text-xs text-muted-foreground font-medium">
										{isInbox
											? t("nav.inbox")
											: (project?.name ?? group.projectId)}
									</span>
								</div>
								{group.due.map((task) => (
									<button
										key={task.id}
										type="button"
										title={task.title}
										onClick={() => onTaskClick(task)}
										className="text-xs text-left px-2 py-1.5 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors w-full"
									>
										{task.title}
									</button>
								))}
								{group.completed.map((task) => (
									<button
										key={task.id}
										type="button"
										title={task.title}
										onClick={() => onTaskClick(task)}
										className="text-xs text-left px-2 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors w-full line-through opacity-70"
									>
										{task.title}
									</button>
								))}
							</div>
						);
					})
				) : (
					<>
						{due.map((task) => (
							<button
								key={task.id}
								type="button"
								title={task.title}
								onClick={() => onTaskClick(task)}
								className="text-xs text-left px-2 py-1.5 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors w-full"
							>
								{task.title}
							</button>
						))}
						{completed.map((task) => (
							<button
								key={task.id}
								type="button"
								title={task.title}
								onClick={() => onTaskClick(task)}
								className="text-xs text-left px-2 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors w-full line-through opacity-70"
							>
								{task.title}
							</button>
						))}
					</>
				)}
			</div>

			<div className="shrink-0 border-t border-border/40 py-1">
				<QuickAddTask
					projectId={projectFilter ?? null}
					dueDate={day}
					focusTrigger={focusTrigger}
				/>
			</div>
		</div>
	);
}
