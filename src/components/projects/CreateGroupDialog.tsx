import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GROUP_COLORS, pickGroupColor } from "@/lib/group-colors";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import type { Project } from "@/types";

interface CreateGroupDialogProps {
	open: boolean;
	projectA: Project;
	projectB: Project;
	onConfirm(groupId: string): void;
	onCancel(): void;
}

export function CreateGroupDialog({
	open,
	projectA,
	projectB,
	onConfirm,
	onCancel,
}: CreateGroupDialogProps) {
	const { t } = useTranslation();
	const groups = useProjectGroupStore((s) => s.groups);
	const { createGroup } = useProjectGroupStore();
	const { assignToGroup } = useProjectStore();
	const [name, setName] = useState("");
	const [color, setColor] = useState(() => pickGroupColor(groups));
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setName("");
			setColor(pickGroupColor(groups));
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open, groups]);

	async function handleConfirm() {
		if (!name.trim()) return;
		const repo = getRepository();
		const group = await createGroup(repo, {
			name: name.trim(),
			color,
		});
		await assignToGroup(repo, projectA.id, group.id);
		await assignToGroup(repo, projectB.id, group.id);
		onConfirm(group.id);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onCancel();
			}}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>
						{t("projectGroup.createTitle", "Nouveau groupe")}
					</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<Input
						ref={inputRef}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t("projectGroup.namePlaceholder", "Nom du groupe")}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleConfirm();
						}}
					/>

					<div className="flex gap-2 flex-wrap">
						{GROUP_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setColor(c)}
								className="h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1"
								style={{
									backgroundColor: c,
									outline: color === c ? `2px solid ${c}` : undefined,
									outlineOffset: color === c ? "2px" : undefined,
								}}
								aria-label={c}
							/>
						))}
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						{t("common.cancel", "Annuler")}
					</Button>
					<Button onClick={handleConfirm} disabled={!name.trim()}>
						{t("projectGroup.create", "Créer")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
