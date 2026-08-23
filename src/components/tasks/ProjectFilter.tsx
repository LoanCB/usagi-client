import { Check, Inbox, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button-variants";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import type { Project, ProjectGroup } from "@/types";

interface ProjectFilterProps {
	readonly value: string[] | null;
	readonly onChange: (value: string[] | null) => void;
}

function ProjectIcon({
	project,
	className,
}: Readonly<{
	project: Project;
	className?: string;
}>) {
	const iconDef =
		PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
	const Icon = iconDef.icon;
	return (
		<Icon className={className} style={{ color: project.color ?? undefined }} />
	);
}

type GroupState = "none" | "some" | "all";

function ariaPressedFor(state: GroupState): boolean | "mixed" {
	if (state === "all") return true;
	if (state === "some") return "mixed";
	return false;
}

export function ProjectFilter({ value, onChange }: ProjectFilterProps) {
	const { t } = useTranslation();
	const { projects } = useProjectStore();
	const { groups } = useProjectGroupStore();

	const selectedIds = value ?? [];
	const selectedSet = new Set(selectedIds);
	const count = selectedIds.length;
	const isSelected = (id: string) => selectedSet.has(id);

	// A group is a selection shortcut: its rows expand to its member project ids.
	const groupSections: { group: ProjectGroup; members: Project[] }[] = [];
	// groups already arrives in repository order; sortOrder is a dead column.
	for (const group of groups) {
		const members = projects.filter((p) => p.groupId === group.id);
		if (members.length > 0) groupSections.push({ group, members });
	}
	const ungroupedProjects = projects.filter(
		(p) => !groupSections.some((s) => s.group.id === p.groupId),
	);

	function toggle(id: string) {
		const next = isSelected(id)
			? selectedIds.filter((v) => v !== id)
			: [...selectedIds, id];
		onChange(next.length === 0 ? null : next);
	}

	function groupStateOf(members: Project[]): GroupState {
		const selectedCount = members.filter((p) => isSelected(p.id)).length;
		if (selectedCount === 0) return "none";
		return selectedCount === members.length ? "all" : "some";
	}

	function toggleGroup(members: Project[]) {
		const memberIds = members.map((p) => p.id);
		if (groupStateOf(members) === "all") {
			const memberIdSet = new Set(memberIds);
			const next = selectedIds.filter((id) => !memberIdSet.has(id));
			onChange(next.length === 0 ? null : next);
		} else {
			onChange([...new Set([...selectedIds, ...memberIds])]);
		}
	}

	// When the selection is exactly one group's members, style the trigger as
	// that group; otherwise fall back to the single-project / count styling.
	const singleGroup =
		count > 0
			? (groupSections.find(
					(s) =>
						s.members.length === count &&
						s.members.every((p) => isSelected(p.id)),
				)?.group ?? null)
			: null;

	const singleId = !singleGroup && count === 1 ? selectedIds[0] : null;
	const singleInbox = singleId === INBOX_PROJECT_ID;
	const singleProject =
		singleId && !singleInbox
			? (projects.find((p) => p.id === singleId) ?? null)
			: null;

	let triggerStyle: React.CSSProperties | undefined;
	if (singleGroup) {
		triggerStyle = {
			borderColor: `${singleGroup.color}66`,
			background: `${singleGroup.color}18`,
			color: singleGroup.color,
		};
	} else if (singleInbox) {
		triggerStyle = {
			borderColor: "rgba(148,163,184,0.4)",
			background: "rgba(148,163,184,0.08)",
			color: "#94a3b8",
		};
	} else if (singleProject) {
		triggerStyle = {
			borderColor: `${singleProject.color}66`,
			background: `${singleProject.color}18`,
			color: singleProject.color ?? undefined,
		};
	}

	return (
		<Popover>
			<PopoverTrigger
				aria-label={t("filter.projectFilter")}
				className={cn(
					buttonVariants({ variant: "outline", size: "sm" }),
					"gap-1.5 h-7 px-2 text-xs max-w-[10rem]",
				)}
				style={triggerStyle}
			>
				{count === 0 && (
					<span className="truncate min-w-0">{t("filter.allProjects")}</span>
				)}
				{singleGroup && (
					<>
						<GroupColorShape color={singleGroup.color} size={8} />
						<span className="truncate min-w-0">{singleGroup.name}</span>
					</>
				)}
				{singleInbox && (
					<>
						<Inbox className="h-3.5 w-3.5 shrink-0" />
						<span className="truncate min-w-0">{t("nav.inbox")}</span>
					</>
				)}
				{singleProject && (
					<>
						<span
							className="h-[7px] w-[7px] rounded-full shrink-0"
							style={{ background: singleProject.color ?? "#94a3b8" }}
						/>
						<span className="truncate min-w-0">{singleProject.name}</span>
					</>
				)}
				{singleId && !singleInbox && !singleProject && (
					<span className="truncate min-w-0 opacity-60">
						{t("filter.allProjects")}
					</span>
				)}
				{count > 1 && !singleGroup && (
					<span className="truncate min-w-0">
						{`${count} ${t("filter.projects")}`}
					</span>
				)}
				<span className="opacity-40 text-[10px] shrink-0">▾</span>
			</PopoverTrigger>
			<PopoverContent className="w-52 p-2" align="end">
				<div className="space-y-0.5">
					<button
						type="button"
						onClick={() => onChange(null)}
						className={cn(
							"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
							count === 0 && "bg-accent",
						)}
					>
						<span className="flex-1 text-left truncate">
							{t("filter.allProjects")}
						</span>
						{count === 0 && <Check className="h-3.5 w-3.5 shrink-0" />}
					</button>
					<button
						type="button"
						onClick={() => toggle(INBOX_PROJECT_ID)}
						className={cn(
							"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
							isSelected(INBOX_PROJECT_ID) && "bg-accent",
						)}
					>
						<Inbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="flex-1 text-left truncate">{t("nav.inbox")}</span>
						{isSelected(INBOX_PROJECT_ID) && (
							<Check className="h-3.5 w-3.5 shrink-0" />
						)}
					</button>
					{projects.length > 0 && <div className="my-1 h-px bg-border/40" />}
					{groupSections.map(({ group, members }) => {
						const state = groupStateOf(members);
						const pressed = ariaPressedFor(state);
						return (
							<div key={group.id}>
								<button
									type="button"
									aria-pressed={pressed}
									onClick={() => toggleGroup(members)}
									className={cn(
										"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm font-medium hover:bg-accent transition-colors",
										state === "all" && "bg-accent",
									)}
								>
									<GroupColorShape color={group.color} size={10} />
									<span className="flex-1 text-left truncate">
										{group.name}
									</span>
									{state === "all" && (
										<Check className="h-3.5 w-3.5 shrink-0" />
									)}
									{state === "some" && (
										<Minus className="h-3.5 w-3.5 shrink-0 opacity-60" />
									)}
								</button>
								{members.map((project) => (
									<ProjectRow
										key={project.id}
										project={project}
										selected={isSelected(project.id)}
										indented
										onToggle={() => toggle(project.id)}
									/>
								))}
							</div>
						);
					})}
					{ungroupedProjects.map((project) => (
						<ProjectRow
							key={project.id}
							project={project}
							selected={isSelected(project.id)}
							onToggle={() => toggle(project.id)}
						/>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ProjectRow({
	project,
	selected,
	indented = false,
	onToggle,
}: Readonly<{
	project: Project;
	selected: boolean;
	indented?: boolean;
	onToggle: () => void;
}>) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={cn(
				"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
				indented && "pl-7",
				selected && "bg-accent",
			)}
		>
			<ProjectIcon project={project} className="h-3.5 w-3.5 shrink-0" />
			<span className="flex-1 text-left truncate">{project.name}</span>
			{selected && <Check className="h-3.5 w-3.5 shrink-0" />}
		</button>
	);
}
