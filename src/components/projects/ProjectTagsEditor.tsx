import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { GroupColorShape } from "@/components/ui/GroupColorShape";
import { Input } from "@/components/ui/input";
import { PRESET_COLORS } from "@/lib/colors";
import { getRepository } from "@/store/repository";
import { useTagStore } from "@/store/tags";
import type { Tag } from "@/types";
import { tagErrorMessage } from "./tag-error-message";

interface TagEdit {
	readonly id: string;
	readonly name: string;
	readonly color: string;
}

/** Rendered inside ProjectForm's <form>: Enter here must not submit the project. */
function onEnter(e: KeyboardEvent, action: () => void) {
	if (e.nativeEvent.isComposing || e.key !== "Enter") return;
	e.preventDefault();
	action();
}

function TagEditRow({
	edit,
	onChange,
	onSave,
	onCancel,
}: {
	readonly edit: TagEdit;
	readonly onChange: (edit: TagEdit) => void;
	readonly onSave: () => void;
	readonly onCancel: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="space-y-2 rounded-md border border-border p-2">
			<div className="flex items-center gap-1">
				<Input
					aria-label={t("tag.namePlaceholder")}
					value={edit.name}
					onChange={(e) => onChange({ ...edit, name: e.target.value })}
					onKeyDown={(e) => onEnter(e, onSave)}
					className="h-7 text-sm"
					autoFocus
				/>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="h-7 w-7 shrink-0"
					disabled={!edit.name.trim()}
					onClick={onSave}
					aria-label={t("common.save")}
				>
					<Check className="h-3.5 w-3.5" />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="h-7 w-7 shrink-0"
					onClick={onCancel}
					aria-label={t("common.cancel")}
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>
			<ColorPicker
				colors={PRESET_COLORS}
				selectedColor={edit.color}
				onSelect={(color) => onChange({ ...edit, color })}
			/>
		</div>
	);
}

/** Changes apply immediately, as in TagManager: the form's Cancel leaves them. */
export function ProjectTagsEditor({
	projectId,
}: {
	readonly projectId: string;
}) {
	const { t } = useTranslation();
	const { tags, createTag, updateTag, deleteTag } = useTagStore();
	const [edit, setEdit] = useState<TagEdit | null>(null);
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState<string>(PRESET_COLORS[5]);
	const [error, setError] = useState<string | null>(null);
	const projectTags = tags.filter((tag) => tag.projectId === projectId);

	function startEdit(tag: Tag) {
		setEdit({
			id: tag.id,
			name: tag.name,
			color: tag.color ?? PRESET_COLORS[5],
		});
	}

	async function saveEdit() {
		if (!edit?.name.trim()) return;
		setError(null);
		try {
			await updateTag(getRepository(), edit.id, {
				name: edit.name.trim(),
				color: edit.color,
			});
			setEdit(null);
		} catch (e) {
			setError(tagErrorMessage(t, e));
		}
	}

	async function addTag() {
		const name = newName.trim();
		if (!name) return;
		setError(null);
		try {
			await createTag(getRepository(), { name, color: newColor, projectId });
			setNewName("");
			setNewColor(PRESET_COLORS[5]);
		} catch (e) {
			setError(tagErrorMessage(t, e));
		}
	}

	return (
		<div>
			<p className="mb-2 text-xs text-muted-foreground">{t("tag.tags")}</p>
			<div className="max-h-44 space-y-1 overflow-y-auto">
				{projectTags.map((tag) =>
					edit?.id === tag.id ? (
						<TagEditRow
							key={tag.id}
							edit={edit}
							onChange={setEdit}
							onSave={() => void saveEdit()}
							onCancel={() => setEdit(null)}
						/>
					) : (
						<div key={tag.id} className="flex items-center gap-2 px-1">
							<GroupColorShape
								color={tag.color ?? "var(--muted-foreground)"}
								size={10}
								className="shrink-0"
							/>
							<span className="flex-1 truncate text-sm">{tag.name}</span>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="h-7 w-7"
								onClick={() => startEdit(tag)}
								aria-label={`${t("tag.edit")} ${tag.name}`}
							>
								<Pencil className="h-3.5 w-3.5" />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="h-7 w-7 text-destructive hover:text-destructive"
								onClick={() => void deleteTag(getRepository(), tag.id)}
								aria-label={`${t("tag.delete")} ${tag.name}`}
							>
								<Trash2 className="h-3.5 w-3.5" />
							</Button>
						</div>
					),
				)}
			</div>
			<div className="mt-1 flex items-center gap-1">
				<Input
					aria-label={t("tag.new")}
					placeholder={t("tag.namePlaceholder")}
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
					onKeyDown={(e) => onEnter(e, () => void addTag())}
					className="h-7 text-sm"
				/>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="h-7 w-7 shrink-0"
					disabled={!newName.trim()}
					onClick={() => void addTag()}
					aria-label={t("tag.new")}
				>
					<Plus className="h-3.5 w-3.5" />
				</Button>
			</div>
			<div className="mt-2">
				<ColorPicker
					colors={PRESET_COLORS}
					selectedColor={newColor}
					onSelect={setNewColor}
				/>
			</div>
			{error && (
				<p role="alert" className="mt-2 text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
