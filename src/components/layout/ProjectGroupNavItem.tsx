import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { Input } from "@/components/ui/input";
import { GROUP_COLORS } from "@/lib/group-colors";
import { cn } from "@/lib/utils";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useUIStore } from "@/store/ui";
import type { Project, ProjectGroup } from "@/types";

interface ProjectGroupNavItemProps {
	group: ProjectGroup;
	projects: Project[];
	collapsed: boolean;
	isDragOver?: boolean;
}

export function ProjectGroupNavItem({
	group,
	projects,
	collapsed,
	isDragOver = false,
}: Readonly<ProjectGroupNavItemProps>) {
	const { t } = useTranslation();
	const { collapsedGroupIds, toggleGroupCollapsed } = useUIStore();
	const { updateGroup } = useProjectGroupStore();
	const { assignToGroup } = useProjectStore();
	const isCollapsed = isDragOver ? false : collapsedGroupIds.has(group.id);
	const [editOpen, setEditOpen] = useState(false);
	const [editName, setEditName] = useState("");
	const [editColor, setEditColor] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editOpen) {
			setEditName(group.name);
			setEditColor(group.color);
			// Capture and clear the focus timer so a quick open→close doesn't fire
			// inputRef.current?.focus() against an unmounted input.
			const id = setTimeout(() => inputRef.current?.focus(), 50);
			return () => clearTimeout(id);
		}
	}, [editOpen, group.name, group.color]);

	async function handleDissolve() {
		const repo = getRepository();
		await Promise.all(projects.map((p) => assignToGroup(repo, p.id, null)));
	}

	async function handleEditConfirm() {
		const trimmed = editName.trim();
		if (!trimmed) return;
		const patch: Partial<Pick<ProjectGroup, "name" | "color">> = {};
		if (trimmed !== group.name) patch.name = trimmed;
		if (editColor !== group.color) patch.color = editColor;
		if (Object.keys(patch).length > 0) {
			await updateGroup(getRepository(), group.id, patch);
		}
		setEditOpen(false);
	}

	if (collapsed) {
		return (
			<div
				className="mx-2 h-0.5 rounded-full"
				style={{ backgroundColor: group.color }}
				title={group.name}
			/>
		);
	}

	return (
		<div
			className={cn(
				"rounded-md transition-all",
				isDragOver && "border-2 border-dashed",
			)}
			style={
				isDragOver
					? {
							borderColor: group.color,
							backgroundColor: `${group.color}1a`,
						}
					: undefined
			}
		>
			<ContextMenu>
				<ContextMenuTrigger>
					<button
						type="button"
						onClick={() => toggleGroupCollapsed(group.id)}
						className={cn(
							"flex w-full items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider",
							"text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors",
						)}
					>
						<GroupColorShape
							color={group.color}
							size={8}
							className="shrink-0"
						/>
						<span className="flex-1 truncate text-left">{group.name}</span>
						{isCollapsed ? (
							<ChevronRight className="h-3 w-3 shrink-0" />
						) : (
							<ChevronDown className="h-3 w-3 shrink-0" />
						)}
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onClick={() => setEditOpen(true)}>
						{t("common.edit", "Modifier")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={handleDissolve} variant="destructive">
						{t("projectGroup.dissolve", "Dissoudre le groupe")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<Dialog
				open={editOpen}
				onOpenChange={(o) => {
					if (!o) setEditOpen(false);
				}}
			>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>
							{t("projectGroup.edit", "Modifier le groupe")}
						</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-2">
						<Input
							ref={inputRef}
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
							placeholder={t("projectGroup.namePlaceholder", "Nom du groupe")}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleEditConfirm();
							}}
						/>
						<ColorPicker
							colors={GROUP_COLORS}
							selectedColor={editColor}
							onSelect={setEditColor}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditOpen(false)}>
							{t("common.cancel", "Annuler")}
						</Button>
						<Button onClick={handleEditConfirm} disabled={!editName.trim()}>
							{t("common.save", "Enregistrer")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
