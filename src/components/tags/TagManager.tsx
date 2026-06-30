import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useReducer } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { Input } from "@/components/ui/input";
import { PRESET_COLORS } from "@/lib/colors";
import { PRESET_ICONS } from "@/lib/icons";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useTagStore } from "@/store/tags";
import type { Tag } from "@/types";

function TagColorPicker({
	value,
	onChange,
}: {
	readonly value: string;
	readonly onChange: (c: string) => void;
}) {
	return (
		<div className="mt-1">
			<ColorPicker
				colors={PRESET_COLORS}
				selectedColor={value}
				onSelect={onChange}
			/>
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

// Each tag form is one cohesive unit: `startEdit` populates all five edit
// fields at once and `handleCreate` resets all four new-tag fields together, so
// each form gets its own reducer rather than scattering setState calls.
type TagEditState = {
	id: string | null;
	name: string;
	color: string;
	projectId: string | null;
	constrained: boolean;
};

type TagEditAction =
	| { type: "start"; tag: Tag }
	| { type: "setName"; value: string }
	| { type: "setColor"; value: string }
	| { type: "setProjectId"; value: string | null }
	| { type: "setConstrained"; value: boolean }
	| { type: "close" };

const initialTagEdit: TagEditState = {
	id: null,
	name: "",
	color: PRESET_COLORS[5],
	projectId: null,
	constrained: false,
};

function tagEditReducer(
	state: TagEditState,
	action: TagEditAction,
): TagEditState {
	switch (action.type) {
		case "start":
			return {
				id: action.tag.id,
				name: action.tag.name,
				color: action.tag.color ?? PRESET_COLORS[5],
				projectId: action.tag.projectId,
				constrained: false,
			};
		case "setName":
			return { ...state, name: action.value };
		case "setColor":
			return { ...state, color: action.value };
		case "setProjectId":
			return { ...state, projectId: action.value };
		case "setConstrained":
			return { ...state, constrained: action.value };
		case "close":
			return { ...state, id: null };
	}
}

type TagDraftState = {
	show: boolean;
	name: string;
	color: string;
	projectId: string | null;
};

type TagDraftAction =
	| { type: "open" }
	| { type: "setName"; value: string }
	| { type: "setColor"; value: string }
	| { type: "setProjectId"; value: string | null }
	| { type: "close" }
	| { type: "reset" };

const initialTagDraft: TagDraftState = {
	show: false,
	name: "",
	color: PRESET_COLORS[5],
	projectId: null,
};

function tagDraftReducer(
	state: TagDraftState,
	action: TagDraftAction,
): TagDraftState {
	switch (action.type) {
		case "open":
			return { ...state, show: true };
		case "setName":
			return { ...state, name: action.value };
		case "setColor":
			return { ...state, color: action.value };
		case "setProjectId":
			return { ...state, projectId: action.value };
		case "close":
			return { ...state, show: false };
		case "reset":
			return initialTagDraft;
	}
}

export function TagManager() {
	const { t } = useTranslation();
	const { tags, createTag, updateTag, deleteTag } = useTagStore();
	const { projects } = useProjectStore();
	const [edit, editDispatch] = useReducer(tagEditReducer, initialTagEdit);
	const {
		id: editingId,
		name: editName,
		color: editColor,
		projectId: editProjectId,
		constrained: editConstrained,
	} = edit;
	const [draft, draftDispatch] = useReducer(tagDraftReducer, initialTagDraft);
	const {
		show: showNew,
		name: newName,
		color: newColor,
		projectId: newProjectId,
	} = draft;

	async function startEdit(tag: Tag) {
		editDispatch({ type: "start", tag });
		const constrained = await getRepository().isTagUsedInProjectTasks(tag.id);
		editDispatch({ type: "setConstrained", value: constrained });
	}

	async function commitEdit() {
		if (!editName.trim() || !editingId) return;
		await updateTag(getRepository(), editingId, {
			name: editName.trim(),
			color: editColor,
			projectId: editProjectId,
		});
		editDispatch({ type: "close" });
	}

	async function handleCreate() {
		if (!newName.trim()) return;
		await createTag(getRepository(), {
			name: newName.trim(),
			color: newColor,
			projectId: newProjectId,
		});
		draftDispatch({ type: "reset" });
	}

	const genericTags = tags.filter((t) => t.projectId === null);
	const projectGroups = projects.flatMap((p) => {
		const projectTags = tags.filter((t) => t.projectId === p.id);
		return projectTags.length > 0 ? [{ project: p, tags: projectTags }] : [];
	});

	function renderTag(tag: Tag) {
		if (editingId === tag.id) {
			return (
				<div
					key={tag.id}
					className="rounded-md border border-border p-3 space-y-1.5 mb-1"
				>
					<div className="flex items-center gap-2">
						<span
							className="h-2.5 w-2.5 rounded-full shrink-0"
							style={{ background: editColor }}
						/>
						<Input
							value={editName}
							onChange={(e) =>
								editDispatch({ type: "setName", value: e.target.value })
							}
							className="h-7 text-sm"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter") commitEdit();
								if (e.key === "Escape") editDispatch({ type: "close" });
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
							onClick={() => editDispatch({ type: "close" })}
						>
							<X className="h-3.5 w-3.5" />
						</Button>
					</div>
					<TagColorPicker
						value={editColor}
						onChange={(value) => editDispatch({ type: "setColor", value })}
					/>
					<TagProjectSelect
						value={editProjectId}
						onChange={(value) => editDispatch({ type: "setProjectId", value })}
						disabled={editConstrained}
					/>
					{editConstrained && (
						<p className="text-xs text-muted-foreground">
							{t("tag.projectConstraint")}
						</p>
					)}
				</div>
			);
		}
		return (
			<ContextMenu key={tag.id}>
				<ContextMenuTrigger>
					<div className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/40 group">
						<GroupColorShape
							color={tag.color ?? "var(--muted-foreground)"}
							size={10}
							className="shrink-0"
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
					onClick={() => draftDispatch({ type: "open" })}
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
							onChange={(e) =>
								draftDispatch({ type: "setName", value: e.target.value })
							}
							autoFocus
							onKeyDown={(e) => e.key === "Enter" && handleCreate()}
						/>
						<TagColorPicker
							value={newColor}
							onChange={(value) => draftDispatch({ type: "setColor", value })}
						/>
						<TagProjectSelect
							value={newProjectId}
							onChange={(value) =>
								draftDispatch({ type: "setProjectId", value })
							}
						/>
						<div className="flex gap-2 justify-end">
							<Button
								size="sm"
								variant="outline"
								onClick={() => draftDispatch({ type: "close" })}
							>
								<X className="h-3.5 w-3.5" />
							</Button>
							<Button
								size="sm"
								disabled={!newName.trim()}
								onClick={handleCreate}
							>
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
					const iconDef =
						PRESET_ICONS.find((i) => i.name === project.icon) ??
						PRESET_ICONS[0];
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
