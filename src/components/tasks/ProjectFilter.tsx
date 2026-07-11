import { Check, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button-variants";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import type { Project } from "@/types";

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

export function ProjectFilter({ value, onChange }: ProjectFilterProps) {
	const { t } = useTranslation();
	const { projects } = useProjectStore();

	const selectedIds = value ?? [];
	const count = selectedIds.length;
	const isSelected = (id: string) => selectedIds.includes(id);

	function toggle(id: string) {
		const next = isSelected(id)
			? selectedIds.filter((v) => v !== id)
			: [...selectedIds, id];
		onChange(next.length === 0 ? null : next);
	}

	// A single selection keeps the coloured styling; anything else is neutral.
	const singleId = count === 1 ? selectedIds[0] : null;
	const singleInbox = singleId === INBOX_PROJECT_ID;
	const singleProject =
		singleId && !singleInbox
			? (projects.find((p) => p.id === singleId) ?? null)
			: null;

	let triggerStyle: React.CSSProperties | undefined;
	if (singleInbox) {
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
					"gap-1.5 h-7 px-2 text-xs",
				)}
				style={triggerStyle}
			>
				{count === 0 && (
					<span className="truncate min-w-0">{t("filter.allProjects")}</span>
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
				{count > 1 && (
					<span className="truncate min-w-0">
						{`${count} ${t("filter.projects")}`}
					</span>
				)}
				<span className="opacity-40 text-[10px]">▾</span>
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
					{projects.map((project) => (
						<button
							type="button"
							key={project.id}
							onClick={() => toggle(project.id)}
							className={cn(
								"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
								isSelected(project.id) && "bg-accent",
							)}
						>
							<ProjectIcon project={project} className="h-3.5 w-3.5 shrink-0" />
							<span className="flex-1 text-left truncate">{project.name}</span>
							{isSelected(project.id) && (
								<Check className="h-3.5 w-3.5 shrink-0" />
							)}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
