import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PRESET_COLORS } from "@/lib/colors";
import { PRESET_ICONS } from "@/lib/icons";
import { getRepository } from "@/store/repository";
import { useProjectStore } from "@/store/projects";
import { useTagStore } from "@/store/tags";
import type { Tag } from "@/types";

function ColorPicker({
	value,
	onChange,
}: {
	readonly value: string;
	readonly onChange: (c: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex gap-1.5 flex-wrap mt-1">
			{PRESET_COLORS.map((c) => (
				<button
					key={c}
					type="button"
					className="h-5 w-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
					style={{
						background: c,
						outline: value === c ? `2px solid ${c}` : undefined,
						outlineOffset: value === c ? "2px" : undefined,
					}}
					aria-label={t("common.colorOption", { color: c })}
					onClick={() => onChange(c)}
				/>
			))}
		</div>
	);
}

function TagProjectSelect({
	value,
	onChange,
	disabled,
}: {
	readonly value: string | null;
	readonly onChange: (v: string | null) => void;
	readonly disabled?: boolean;
}) {
	const { t } = useTranslation();
	const { projects } = useProjectStore();
	return (
		<select
			value={value ?? ""}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value || null)}
			className="h-7 w-full text-sm rounded-md border border-input bg-background px-2 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			<option value="">{t("tag.generic")}</option>
			{projects.map((p) => (
				<option key={p.id} value={p.id}>
					{p.name}
				</option>
			))}
		</select>
	);
}

export function TagManager() {
	const { t } = useTranslation();
	const { tags, createTag, updateTag, deleteTag } = useTagStore();
	const { projects } = useProjectStore();
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editColor, setEditColor] = useState<string>(PRESET_COLORS[5]);
	const [editProjectId, setEditProjectId] = useState<string | null>(null);
	const [editConstrained, setEditConstrained] = useState(false);
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState<string>(PRESET_COLORS[5]);
	const [newProjectId, setNewProjectId] = useState<string | null>(null);
	const [showNew, setShowNew] = useState(false);

	async function startEdit(tag: Tag) {
		setEditingId(tag.id);
		setEditName(tag.name);
		setEditColor(tag.color ?? PRESET_COLORS[5]);
		setEditProjectId(tag.projectId);
		setEditConstrained(false);
		const constrained = await getRepository().isTagUsedInProjectTasks(tag.id);
		setEditConstrained(constrained);
	}

	async function commitEdit() {
		if (!editName.trim() || !editingId) return;
		await updateTag(getRepository(), editingId, {
			name: editName.trim(),
			color: editColor,
			projectId: editProjectId,
		});
		setEditingId(null);
	}

	async function handleCreate() {
		if (!newName.trim()) return;
		await createTag(getRepository(), {
			name: newName.trim(),
			color: newColor,
			projectId: newProjectId,
		});
		setNewName("");
		setNewColor(PRESET_COLORS[5]);
		setNewProjectId(null);
		setShowNew(false);
	}

	const genericTags = tags.filter((t) => t.projectId === null);
	const projectGroups = projects
		.map((p) => ({ project: p, tags: tags.filter((t) => t.projectId === p.id) }))
		.filter((g) => g.tags.length > 0);

	function renderTag(tag: Tag) {
		if (editingId === tag.id) {
			return (
				<div key={tag.id} className="rounded-md border border-border p-3 space-y-1.5 mb-1">
					<div className="flex items-center gap-2">
						<span
							className="h-2.5 w-2.5 rounded-full shrink-0"
							style={{ background: editColor }}
						/>
						<Input
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
							className="h-7 text-sm"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter") commitEdit();
								if (e.key === "Escape") setEditingId(null);
							}}
						/>
						<Button
							size="icon"
							variant="ghost"
							className="h-7 w-7 shrink-0"
							onClick={commitEdit}
						>
							<Check className="h-3.5 w-3.5" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							className="h-7 w-7 shrink-0"
							onClick={() => setEditingId(null)}
						>
							<X className="h-3.5 w-3.5" />
						</Button>
					</div>
					<ColorPicker value={editColor} onChange={setEditColor} />
					<TagProjectSelect
						value={editProjectId}
						onChange={setEditProjectId}
						disabled={editConstrained}
					/>
					{editConstrained && (
						<p className="text-xs text-muted-foreground">{t("tag.projectConstraint")}</p>
					)}
				</div>
			);
		}
		return (
			<ContextMenu key={tag.id}>
				<ContextMenuTrigger asChild>
					<div className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/40 group">
						<span
							className="h-2.5 w-2.5 rounded-full shrink-0"
							style={{ background: tag.color ?? "var(--muted-foreground)" }}
						/>
						<span className="flex-1 text-sm truncate">{tag.name}</span>
						<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
							<Button
								size="icon"
								variant="ghost"
								className="h-7 w-7"
								onClick={() => startEdit(tag)}
								aria-label={t("tag.edit")}
							>
								<Pencil className="h-3.5 w-3.5" />
							</Button>
							<Button
								size="icon"
								variant="ghost"
								className="h-7 w-7 text-destructive hover:text-destructive"
								onClick={() => deleteTag(getRepository(), tag.id)}
								aria-label={t("tag.delete")}
							>
								<Trash2 className="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onClick={() => startEdit(tag)}>
						<Pencil className="h-3.5 w-3.5" />
						{t("tag.edit")}
					</ContextMenuItem>
					<ContextMenuItem
						variant="destructive"
						onClick={() => deleteTag(getRepository(), tag.id)}
					>
						<Trash2 className="h-3.5 w-3.5" />
						{t("tag.delete")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
			<div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
				<h2 className="font-semibold text-base">{t("tag.tags")}</h2>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => setShowNew(true)}
					aria-label={t("tag.new")}
				>
					<Plus className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-3 space-y-1">
				{showNew && (
					<div className="rounded-md border border-border p-3 space-y-2 mb-2">
						<Input
							placeholder={t("tag.namePlaceholder")}
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							autoFocus
							onKeyDown={(e) => e.key === "Enter" && handleCreate()}
						/>
						<ColorPicker value={newColor} onChange={setNewColor} />
						<TagProjectSelect value={newProjectId} onChange={setNewProjectId} />
						<div className="flex gap-2 justify-end">
							<Button size="sm" variant="outline" onClick={() => setShowNew(false)}>
								<X className="h-3.5 w-3.5" />
							</Button>
							<Button size="sm" disabled={!newName.trim()} onClick={handleCreate}>
								<Check className="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				)}

				{tags.length === 0 && !showNew && (
					<p className="text-sm text-muted-foreground text-center py-12">
						{t("tag.noTags")}
					</p>
				)}

				{genericTags.length > 0 && (
					<div>
						<p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
							{t("tag.generic")}
						</p>
						{genericTags.map(renderTag)}
					</div>
				)}

				{projectGroups.map(({ project, tags: ptags }) => {
					const iconDef = PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
					const ProjectIcon = iconDef.icon;
					return (
						<div key={project.id} className="mt-2">
							<div
								className="flex items-center gap-1.5 px-2 py-1"
								style={{ color: project.color ?? undefined }}
							>
								<ProjectIcon className="h-3 w-3 shrink-0" />
								<p className="text-xs font-medium uppercase tracking-wide">
									{project.name}
								</p>
							</div>
							{ptags.map(renderTag)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
