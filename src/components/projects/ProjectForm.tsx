import { type ReactElement, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PRESET_COLORS } from "@/lib/colors";
import { PRESET_ICONS } from "@/lib/icons";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import type { Project } from "@/types";

interface ProjectFormProps {
	/** Trigger element. Omit when using controlled `open`/`onOpenChange`. */
	readonly children?: ReactElement;
	/** Pass an existing project to edit it, omit to create a new one */
	readonly project?: Project;
	readonly onDone?: () => void;
	/** Controlled open state — use when triggering from a DropdownMenu to avoid Radix focus conflicts */
	readonly open?: boolean;
	readonly onOpenChange?: (open: boolean) => void;
}

export function ProjectForm({
	children,
	project,
	onDone,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: ProjectFormProps) {
	const { t } = useTranslation();
	const [internalOpen, setInternalOpen] = useState(false);
	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;

	const [name, setName] = useState(project?.name ?? "");
	const [color, setColor] = useState(project?.color ?? PRESET_COLORS[5]);
	const [icon, setIcon] = useState(project?.icon ?? "Folder");
	const { createProject, updateProject } = useProjectStore();

	function handleOpenChange(isOpen: boolean) {
		if (isControlled) {
			controlledOnOpenChange?.(isOpen);
		} else {
			setInternalOpen(isOpen);
		}
		if (isOpen) {
			setName(project?.name ?? "");
			setColor(project?.color ?? PRESET_COLORS[5]);
			setIcon(project?.icon ?? "Folder");
		}
	}

	async function handleSubmit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (!name.trim()) return;
		const repo = getRepository();
		if (project) {
			await updateProject(repo, project.id, { name: name.trim(), color, icon });
		} else {
			await createProject(repo, { name: name.trim(), color, icon });
		}
		handleOpenChange(false);
		onDone?.();
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			{children && <DialogTrigger render={children} />}
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{project ? t("project.edit") : t("project.new")}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4 pt-2">
					<Input
						placeholder={t("project.namePlaceholder")}
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
					/>
					<div>
						<p className="text-xs text-muted-foreground mb-2">
							{t("common.icon")}
						</p>
						<div className="flex gap-2 flex-wrap">
							{PRESET_ICONS.map(({ name: iconName, icon: Icon }) => (
								<button
									key={iconName}
									type="button"
									className="h-7 w-7 rounded-md flex items-center justify-center transition-colors hover:bg-accent focus:outline-none"
									style={{
										outline:
											icon === iconName ? `2px solid ${color}` : undefined,
										outlineOffset: icon === iconName ? "2px" : undefined,
									}}
									aria-label={t("common.iconOption", { name: iconName })}
									onClick={() => setIcon(iconName)}
								>
									<Icon className="h-4 w-4" />
								</button>
							))}
						</div>
					</div>
					<div>
						<p className="text-xs text-muted-foreground mb-2">
							{t("common.color")}
						</p>
						<div className="flex gap-2 flex-wrap">
							{PRESET_COLORS.map((c) => (
								<button
									key={c}
									type="button"
									className="h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none"
									style={{
										background: c,
										outline: color === c ? `2px solid ${c}` : undefined,
										outlineOffset: color === c ? "2px" : undefined,
									}}
									aria-label={t("common.colorOption", { color: c })}
									onClick={() => setColor(c)}
								/>
							))}
						</div>
					</div>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={!name.trim()}>
							{project ? t("common.save") : t("common.create")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
