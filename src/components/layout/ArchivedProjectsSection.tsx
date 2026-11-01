import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { PRESET_ICONS } from "@/lib/icons";
import { formatDate } from "@/lib/utils";
import { useArchiveStore } from "@/store/archives";
import { getRepository } from "@/store/repository";
import { useUIStore } from "@/store/ui";
import type { Project, ProjectGroup } from "@/types";

function ArchivedOn({ date }: { readonly date: string | null }) {
	const { t, i18n } = useTranslation();
	if (!date) return null;
	return (
		<>
			<span className="mx-1.5">·</span>
			{t("archive.projectArchivedOn", {
				date: formatDate(date.slice(0, 10), i18n.language),
			})}
		</>
	);
}

function RestoreButton({
	name,
	onRestore,
}: {
	readonly name: string;
	readonly onRestore: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Button
			variant="ghost"
			size="icon"
			className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
			onClick={onRestore}
			aria-label={t("archive.restoreItem", { name })}
		>
			<RotateCcw className="h-3.5 w-3.5" />
		</Button>
	);
}

// `onRestore` is absent for a project of an archived group: it comes back with
// the group, so a restore here would have nothing to show for it.
function ArchivedProjectRow({
	project,
	taskCount,
	onRestore,
}: {
	readonly project: Project;
	readonly taskCount: number;
	readonly onRestore?: () => void;
}) {
	const { t } = useTranslation();
	const setSelectedProject = useUIStore((s) => s.setSelectedProject);
	const ProjectIcon = (
		PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0]
	).icon;
	return (
		<div className="flex items-center gap-2 pr-2 rounded-xl border glass-card">
			<button
				type="button"
				onClick={() => setSelectedProject(project.id)}
				className="flex flex-1 min-w-0 items-center gap-3 pl-3 py-2.5 text-left"
			>
				<ProjectIcon
					className="h-4 w-4 shrink-0"
					style={{ color: project.color ?? undefined }}
				/>
				<span className="min-w-0">
					<span className="block text-sm truncate">{project.name}</span>
					<span className="block text-xs text-muted-foreground/60 mt-0.5">
						{t("archive.taskCount", { count: taskCount })}
						<ArchivedOn date={project.archivedAt} />
					</span>
				</span>
			</button>
			{onRestore && <RestoreButton name={project.name} onRestore={onRestore} />}
		</div>
	);
}

function ArchivedGroupRow({
	group,
	projects,
	taskCounts,
	onRestore,
}: {
	readonly group: ProjectGroup;
	readonly projects: Project[];
	readonly taskCounts: ReadonlyMap<string, number>;
	readonly onRestore: () => void;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const Chevron = open ? ChevronDown : ChevronRight;
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2 pr-2 rounded-xl border glass-card">
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-expanded={open}
					className="flex flex-1 min-w-0 items-center gap-3 pl-3 py-2.5 text-left"
				>
					<GroupColorShape color={group.color} size={10} className="shrink-0" />
					<span className="min-w-0 flex-1">
						<span className="block text-sm font-medium truncate">
							{group.name}
						</span>
						<span className="block text-xs text-muted-foreground/60 mt-0.5">
							{t("archive.projectCount", { count: projects.length })}
							<ArchivedOn date={group.archivedAt} />
						</span>
					</span>
					<Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</button>
				<RestoreButton name={group.name} onRestore={onRestore} />
			</div>
			{open && (
				<div className="flex flex-col gap-1 pl-5">
					{projects.map((project) => (
						<ArchivedProjectRow
							key={project.id}
							project={project}
							taskCount={taskCounts.get(project.id) ?? 0}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function ArchivedProjectsSection() {
	const { t } = useTranslation();
	const projects = useArchiveStore((s) => s.projects);
	const groups = useArchiveStore((s) => s.groups);
	const tasks = useArchiveStore((s) => s.tasks);
	const restoreProject = useArchiveStore((s) => s.restoreProject);
	const restoreGroup = useArchiveStore((s) => s.restoreGroup);

	const taskCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const { projectId } of tasks) {
			if (projectId) counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
		}
		return counts;
	}, [tasks]);

	if (projects.length === 0 && groups.length === 0) return null;

	const repo = getRepository();
	const groupIds = new Set(groups.map((g) => g.id));
	const standalone = projects.filter(
		(p) => p.groupId === null || !groupIds.has(p.groupId),
	);

	return (
		<section className="flex flex-col gap-2 px-3 pt-3">
			<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{t("archive.projectsSection")}
			</h3>
			{groups.map((group) => (
				<ArchivedGroupRow
					key={group.id}
					group={group}
					projects={projects.filter((p) => p.groupId === group.id)}
					taskCounts={taskCounts}
					onRestore={() => restoreGroup(repo, group.id)}
				/>
			))}
			{standalone.map((project) => (
				<ArchivedProjectRow
					key={project.id}
					project={project}
					taskCount={taskCounts.get(project.id) ?? 0}
					onRestore={() => restoreProject(repo, project.id)}
				/>
			))}
		</section>
	);
}
