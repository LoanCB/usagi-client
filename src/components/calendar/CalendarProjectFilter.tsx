import { Check, Inbox } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { PRESET_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import type { Project } from "@/types";

interface CalendarProjectFilterProps {
	readonly value: string | null | undefined;
	readonly onChange: (value: string | null | undefined) => void;
}

function ProjectIcon({
	project,
	className,
}: {
	project: Project;
	className?: string;
}) {
	const iconDef =
		PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
	const Icon = iconDef.icon;
	return (
		<Icon className={className} style={{ color: project.color ?? undefined }} />
	);
}

export function CalendarProjectFilter({
	value,
	onChange,
}: CalendarProjectFilterProps) {
	const { t } = useTranslation();
	const { projects } = useProjectStore();
	const [open, setOpen] = useState(false);

	const selectedProject =
		typeof value === "string"
			? (projects.find((p) => p.id === value) ?? null)
			: null;

	const triggerStyle =
		value === null
			? {
					borderColor: "rgba(148,163,184,0.4)",
					background: "rgba(148,163,184,0.08)",
					color: "#94a3b8",
				}
			: selectedProject
				? {
						borderColor: `${selectedProject.color}66`,
						background: `${selectedProject.color}18`,
						color: selectedProject.color ?? undefined,
					}
				: undefined;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label={t("calendar.filter.trigger")}
				className={cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"gap-1.5 h-7 px-2.5 text-xs border max-w-[10rem]",
					value === undefined && "border-border/40 text-muted-foreground",
				)}
				style={triggerStyle}
			>
				{value === undefined && (
					<span className="truncate min-w-0">
						{t("calendar.filter.allProjects")}
					</span>
				)}
				{value === null && (
					<>
						<Inbox className="h-3.5 w-3.5 shrink-0" />
						<span className="truncate min-w-0">{t("nav.inbox")}</span>
					</>
				)}
				{selectedProject && (
					<>
						<span
							className="h-[7px] w-[7px] rounded-full shrink-0"
							style={{ background: selectedProject.color ?? "#94a3b8" }}
						/>
						<span className="truncate min-w-0">{selectedProject.name}</span>
					</>
				)}
				{typeof value === "string" && !selectedProject && (
					<span className="truncate min-w-0 opacity-60">
						{t("calendar.filter.allProjects")}
					</span>
				)}
				<span className="opacity-40 text-[10px]">▾</span>
			</PopoverTrigger>
			<PopoverContent className="w-52 p-2" align="end">
				<div className="space-y-0.5">
					<button
						type="button"
						onClick={() => {
							onChange(undefined);
							setOpen(false);
						}}
						className={cn(
							"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
							value === undefined && "bg-accent",
						)}
					>
						<span className="flex-1 text-left truncate">
							{t("calendar.filter.allProjects")}
						</span>
						{value === undefined && <Check className="h-3.5 w-3.5 shrink-0" />}
					</button>
					<button
						type="button"
						onClick={() => {
							onChange(null);
							setOpen(false);
						}}
						className={cn(
							"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
							value === null && "bg-accent",
						)}
					>
						<Inbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="flex-1 text-left truncate">{t("nav.inbox")}</span>
						{value === null && <Check className="h-3.5 w-3.5 shrink-0" />}
					</button>
					{projects.length > 0 && <div className="my-1 h-px bg-border/40" />}
					{projects.map((project) => {
						const selected = value === project.id;
						return (
							<button
								type="button"
								key={project.id}
								onClick={() => {
									onChange(project.id);
									setOpen(false);
								}}
								className={cn(
									"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
									selected && "bg-accent",
								)}
							>
								<ProjectIcon
									project={project}
									className="h-3.5 w-3.5 shrink-0"
								/>
								<span className="flex-1 text-left truncate">
									{project.name}
								</span>
								{selected && <Check className="h-3.5 w-3.5 shrink-0" />}
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}
