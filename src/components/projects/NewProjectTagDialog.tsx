import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PRESET_COLORS } from "@/lib/colors";
import { getRepository } from "@/store/repository";
import { useTagStore } from "@/store/tags";
import type { Project } from "@/types";
import { tagErrorMessage } from "./tag-error-message";

interface NewProjectTagDialogProps {
	readonly project: Project;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

/** A dialog rather than a hover submenu, which closes as the pointer leaves it. */
export function NewProjectTagDialog({
	project,
	open,
	onOpenChange,
}: NewProjectTagDialogProps) {
	const { t } = useTranslation();
	const createTag = useTagStore((s) => s.createTag);
	const [name, setName] = useState("");
	const [color, setColor] = useState<string>(PRESET_COLORS[5]);
	const [error, setError] = useState<string | null>(null);

	function handleOpenChange(isOpen: boolean) {
		onOpenChange(isOpen);
		if (isOpen) return;
		setName("");
		setColor(PRESET_COLORS[5]);
		setError(null);
	}

	async function handleSubmit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (!name.trim()) return;
		setError(null);
		try {
			await createTag(getRepository(), {
				name: name.trim(),
				color,
				projectId: project.id,
			});
			handleOpenChange(false);
		} catch (err) {
			setError(tagErrorMessage(t, err));
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{t("project.newTagFor", { name: project.name })}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4 pt-2">
					<Input
						placeholder={t("tag.namePlaceholder")}
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
					/>
					<ColorPicker
						colors={PRESET_COLORS}
						selectedColor={color}
						onSelect={setColor}
					/>
					{error && (
						<p role="alert" className="text-xs text-destructive">
							{error}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={!name.trim()}>
							{t("common.create")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
