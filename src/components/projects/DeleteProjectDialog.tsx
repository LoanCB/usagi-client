import {
	AlertTriangleIcon,
	ChevronRightIcon,
	FolderSyncIcon,
	InboxIcon,
	TagsIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import type { Project, Tag, Task } from "@/types";

export type TagAction = "delete" | "generic" | "project";
export type TaskAction = "delete" | "inbox" | "project";

export interface DeleteProjectOptions {
	tagAction: TagAction;
	taskAction: TaskAction;
	targetProjectId?: string;
	targetTagProjectId?: string;
	summary: ProjectDeleteSummary;
}

interface DeleteProjectDialogProps {
	readonly project: Project;
	readonly open: boolean;
	readonly onConfirm: (options: DeleteProjectOptions) => void;
	readonly onCancel: () => void;
}

export interface ProjectDeleteSummary {
	tags: Tag[];
	pendingTasks: Task[];
	completedTasks: Task[];
	archivedTasks: Task[];
}

export function DeleteProjectDialog({
	project,
	open,
	onConfirm,
	onCancel,
}: DeleteProjectDialogProps) {
	const { t } = useTranslation();
	const [summary, setSummary] = useState<ProjectDeleteSummary | null>(null);
	const [tagAction, setTagAction] = useState<TagAction>("delete");
	const [taskAction, setTaskAction] = useState<TaskAction>("inbox");
	const [targetProjectId, setTargetProjectId] = useState<string | undefined>();
	const [targetTagProjectId, setTargetTagProjectId] = useState<
		string | undefined
	>();
	const [tasksExpanded, setTasksExpanded] = useState(false);
	const [tagsExpanded, setTagsExpanded] = useState(false);

	const allProjects = useProjectStore((s) => s.projects);
	const otherProjects = allProjects.filter((p) => p.id !== project.id);

	useEffect(() => {
		if (!open) return;
		setTagAction("delete");
		setTaskAction("inbox");
		setTargetProjectId(undefined);
		setTargetTagProjectId(undefined);
		setTasksExpanded(false);
		setTagsExpanded(false);
		const repo = getRepository();
		Promise.all([
			repo.getTags(project.id),
			repo.getTasks({ projectId: project.id, allTasks: true }),
			repo.getArchivedTasks(),
		]).then(([tags, allTasks, archivedAll]) => {
			setSummary({
				tags: tags.filter((tag) => tag.projectId === project.id),
				pendingTasks: allTasks.filter((t) => t.completedAt === null),
				completedTasks: allTasks.filter((t) => t.completedAt !== null),
				archivedTasks: archivedAll.filter((t) => t.projectId === project.id),
			});
		});
	}, [open, project.id]);

	const totalTaskCount = summary
		? summary.pendingTasks.length +
			summary.completedTasks.length +
			summary.archivedTasks.length
		: 0;

	const canConfirm =
		summary !== null &&
		(taskAction !== "project" || targetProjectId !== undefined) &&
		(tagAction !== "project" || targetTagProjectId !== undefined);

	function handleConfirm() {
		if (!summary || !canConfirm) return;
		onConfirm({
			tagAction,
			taskAction,
			targetProjectId,
			targetTagProjectId,
			summary,
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => !v && onCancel()}
			disablePointerDismissal
		>
			<DialogContent
				className="sm:max-w-[460px] gap-0 p-0 rounded-[18px] bg-background/85 supports-backdrop-filter:backdrop-blur-2xl ring-border overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.18)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
				showCloseButton={false}
			>
				{/* HEADER */}
				<div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 shrink-0 rounded-[10px] bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive">
							<AlertTriangleIcon className="w-4 h-4" />
						</div>
						<div>
							<DialogTitle className="text-[17px] font-bold tracking-[-0.3px] flex items-center gap-1.5 flex-wrap">
								<span>{t("common.delete")}</span>

								<span>{project.name}</span>
							</DialogTitle>
							<DialogDescription className="text-xs mt-0.5">
								{t("project.deleteWarning")}
							</DialogDescription>
						</div>
					</div>
					<button
						type="button"
						onClick={onCancel}
						className="shrink-0 w-7 h-7 rounded-[7px] bg-foreground/5 hover:bg-foreground/10 transition-colors flex items-center justify-center text-muted-foreground cursor-pointer"
					>
						<XIcon className="w-3.5 h-3.5" />
					</button>
				</div>

				{/* BODY */}
				{summary && (
					<div className="px-6 py-4 overflow-y-auto max-h-[60vh] flex flex-col gap-5">
						{/* Stats Row */}
						<div className="grid grid-cols-3 gap-2">
							<StatChip
								count={summary.pendingTasks.length}
								label={t("project.statActive")}
								variant="accent"
							/>
							<StatChip
								count={summary.completedTasks.length}
								label={t("project.statDone")}
								variant="green"
							/>
							<StatChip
								count={summary.archivedTasks.length}
								label={t("project.statArchived")}
								variant="muted"
							/>
						</div>

						{/* Tasks Section */}
						<section className="flex flex-col gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								{t("project.deleteTasksSection")}
							</p>

							{summary.pendingTasks.length > 0 && (
								<DisclosureList
									open={tasksExpanded}
									onToggle={() => setTasksExpanded((v) => !v)}
									showLabel={t("project.disclosureShow", {
										count: summary.pendingTasks.length,
									})}
									hideLabel={t("project.disclosureHide")}
									items={summary.pendingTasks.map((task) => ({
										key: task.id,
										content: task.title,
									}))}
								/>
							)}

							{totalTaskCount > 0 && (
								<div className="flex flex-col gap-1.5 mt-1">
									<RadioCard
										checked={taskAction === "inbox"}
										onSelect={() => setTaskAction("inbox")}
										icon={<InboxIcon className="w-[15px] h-[15px]" />}
										label={t("project.taskActionInbox")}
										desc={t("project.taskActionInboxDesc")}
									/>
									<RadioCard
										checked={taskAction === "project"}
										onSelect={() => setTaskAction("project")}
										icon={<FolderSyncIcon className="w-[15px] h-[15px]" />}
										label={t("project.taskActionProject")}
										desc={t("project.taskActionProjectDesc")}
									>
										<div
											className={cn(
												"mt-1.5",
												taskAction !== "project" && "invisible",
											)}
										>
											<Select
												value={targetProjectId}
												onValueChange={(v) =>
													setTargetProjectId(v ?? undefined)
												}
											>
												<SelectTrigger
													size="sm"
													className="w-full"
													onClick={(e) => e.stopPropagation()}
												>
													<SelectValue
														placeholder={t(
															"project.taskActionProjectPlaceholder",
														)}
													>
														{targetProjectId
															? otherProjects.find(
																	(p) => p.id === targetProjectId,
																)?.name
															: null}
													</SelectValue>
												</SelectTrigger>
												<SelectContent alignItemWithTrigger={false}>
													{otherProjects.map((p) => (
														<SelectItem key={p.id} value={p.id}>
															{p.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</RadioCard>
									<RadioCard
										checked={taskAction === "delete"}
										onSelect={() => setTaskAction("delete")}
										icon={<Trash2Icon className="w-[15px] h-[15px]" />}
										label={t("project.taskActionDelete")}
										desc={t("project.taskActionDeleteDesc")}
										danger
									/>
								</div>
							)}
						</section>

						{/* Tags Section */}
						{summary.tags.length > 0 && (
							<section className="flex flex-col gap-2">
								<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									{t("project.deleteTagsSection")}
								</p>

								<DisclosureList
									open={tagsExpanded}
									onToggle={() => setTagsExpanded((v) => !v)}
									showLabel={t("project.disclosureShow", {
										count: summary.tags.length,
									})}
									hideLabel={t("project.disclosureHide")}
									items={summary.tags.map((tag) => ({
										key: tag.id,
										content: (
											<span
												className="text-[11px] px-2 py-0.5 rounded-full font-medium text-white"
												style={{
													background:
														tag.color ?? "var(--color-muted-foreground)",
												}}
											>
												{tag.name}
											</span>
										),
										raw: true,
									}))}
								/>

								<div className="flex flex-col gap-1.5 mt-1">
									<RadioCard
										checked={tagAction === "generic"}
										onSelect={() => setTagAction("generic")}
										icon={<TagsIcon className="w-[15px] h-[15px]" />}
										label={t("project.tagActionGeneric")}
										desc={t("project.tagActionGenericDesc")}
									/>
									<RadioCard
										checked={tagAction === "project"}
										onSelect={() => setTagAction("project")}
										icon={<FolderSyncIcon className="w-[15px] h-[15px]" />}
										label={t("project.tagActionProject")}
										desc={t("project.tagActionProjectDesc")}
									>
										<div
											className={cn(
												"mt-1.5",
												tagAction !== "project" && "invisible",
											)}
										>
											<Select
												value={targetTagProjectId}
												onValueChange={(v) =>
													setTargetTagProjectId(v ?? undefined)
												}
											>
												<SelectTrigger
													size="sm"
													className="w-full"
													onClick={(e) => e.stopPropagation()}
												>
													<SelectValue
														placeholder={t(
															"project.taskActionProjectPlaceholder",
														)}
													>
														{targetTagProjectId
															? otherProjects.find(
																	(p) => p.id === targetTagProjectId,
																)?.name
															: null}
													</SelectValue>
												</SelectTrigger>
												<SelectContent alignItemWithTrigger={false}>
													{otherProjects.map((p) => (
														<SelectItem key={p.id} value={p.id}>
															{p.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</RadioCard>
									<RadioCard
										checked={tagAction === "delete"}
										onSelect={() => setTagAction("delete")}
										icon={<Trash2Icon className="w-[15px] h-[15px]" />}
										label={t("project.tagActionDelete")}
										desc={t("project.tagActionDeleteDesc")}
										danger
									/>
								</div>
							</section>
						)}
					</div>
				)}

				{/* FOOTER */}
				<DialogFooter className="mx-0 mb-0 rounded-b-[18px] px-6 py-3.5 bg-muted/30 flex-row justify-end gap-2">
					<Button variant="outline" size="sm" onClick={onCancel}>
						{t("common.cancel")}
					</Button>
					<Button
						size="sm"
						className="bg-gradient-to-br from-rose-600 to-rose-700 text-white border-rose-500/40 hover:from-rose-500 hover:to-rose-600 shadow-[0_4px_12px_rgba(244,63,94,0.3)] hover:shadow-[0_6px_16px_rgba(244,63,94,0.45)] transition-all duration-150"
						onClick={handleConfirm}
						disabled={!canConfirm}
					>
						<Trash2Icon className="w-3.5 h-3.5" />
						{t("common.delete")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function StatChip({
	count,
	label,
	variant,
}: {
	readonly count: number;
	readonly label: string;
	readonly variant: "accent" | "green" | "muted";
}) {
	return (
		<div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-foreground/[0.04] border border-border">
			<span
				className={cn("text-[18px] font-bold leading-none", {
					"text-primary": variant === "accent",
					"text-emerald-500 dark:text-emerald-400": variant === "green",
					"text-muted-foreground": variant === "muted",
				})}
			>
				{count}
			</span>
			<span className="text-[10px] text-muted-foreground font-medium">
				{label}
			</span>
		</div>
	);
}

type DisclosureItem =
	| { key: string | number; content: string; raw?: false }
	| { key: string | number; content: React.ReactNode; raw: true };

function DisclosureList({
	open,
	onToggle,
	showLabel,
	hideLabel,
	items,
}: {
	readonly open: boolean;
	readonly onToggle: () => void;
	readonly showLabel: string;
	readonly hideLabel: string;
	readonly items: DisclosureItem[];
}) {
	const isRaw = items.length > 0 && items[0].raw === true;

	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] border border-border text-[11px] text-muted-foreground transition-all duration-[140ms] cursor-pointer",
					open
						? "bg-foreground/[0.03]"
						: "bg-transparent hover:bg-foreground/[0.02]",
				)}
			>
				<ChevronRightIcon
					className={cn(
						"w-3 h-3 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				{open ? hideLabel : showLabel}
			</button>
			{open && (
				<div
					className={cn(
						"mt-1.5 rounded-lg border border-border bg-foreground/[0.025] max-h-28 overflow-y-auto",
						isRaw ? "p-2 flex flex-wrap gap-1.5" : "px-3 py-2",
					)}
				>
					{items.map((item) =>
						item.raw ? (
							<span key={item.key}>{item.content}</span>
						) : (
							<div key={item.key} className="flex items-center gap-1.5 py-0.5">
								<span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
								<span className="text-xs text-muted-foreground truncate">
									{item.content}
								</span>
							</div>
						),
					)}
				</div>
			)}
		</div>
	);
}

function RadioCard({
	checked,
	onSelect,
	icon,
	label,
	desc,
	danger,
	children,
}: {
	readonly checked: boolean;
	readonly onSelect: () => void;
	readonly icon: React.ReactNode;
	readonly label: string;
	readonly desc: string;
	readonly danger?: boolean;
	readonly children?: React.ReactNode;
}) {
	return (
		<label
			className={cn(
				"flex items-start gap-2.5 px-3 py-2.5 rounded-[9px] border cursor-pointer transition-all duration-[130ms]",
				checked
					? danger
						? "bg-destructive/10 border-destructive/35"
						: "bg-primary/10 border-primary/30"
					: "border-border hover:bg-foreground/[0.03]",
			)}
		>
			<input
				type="radio"
				className="sr-only"
				checked={checked}
				onChange={onSelect}
			/>
			{/* Radio dot */}
			<span
				className={cn(
					"mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
					checked
						? danger
							? "border-destructive"
							: "border-primary"
						: "border-muted-foreground/40",
				)}
			>
				{checked && (
					<span
						className={cn(
							"w-[7px] h-[7px] rounded-full",
							danger ? "bg-destructive" : "bg-primary",
						)}
					/>
				)}
			</span>
			{/* Icon */}
			<span
				className={cn(
					"shrink-0 mt-0.5 transition-colors",
					checked
						? danger
							? "text-destructive"
							: "text-primary"
						: "text-muted-foreground",
				)}
			>
				{icon}
			</span>
			{/* Text */}
			<div className="flex-1 min-w-0">
				<p
					className={cn(
						"text-[13px] leading-[1.25]",
						checked
							? "font-semibold text-foreground"
							: "font-medium text-foreground",
					)}
				>
					{label}
				</p>
				<p className="text-[11px] text-muted-foreground mt-0.5 leading-[1.3]">
					{desc}
				</p>
				{children}
			</div>
		</label>
	);
}
