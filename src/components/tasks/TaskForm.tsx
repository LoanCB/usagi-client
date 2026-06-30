import { CalendarIcon, X } from "lucide-react";
import React, { type ReactElement, useReducer } from "react";
import { fr } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";
import { RichTextEditor } from "@/components/tasks/RichTextEditor";
import { TagSelector } from "@/components/tasks/TagSelector";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Calendar } from "@/components/ui/calendar";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn, formatDate } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
import type { Priority } from "@/types";

interface TaskFormProps {
	readonly children: ReactElement;
	readonly projectId?: string | null;
}

// The whole new-task form is one unit of state: submitting resets every field
// at once and the date controls flip two flags together, so a reducer keeps
// those linked updates in a single render instead of a cascade of setState.
type TaskFormState = {
	open: boolean;
	title: string;
	description: string;
	priority: Priority;
	dueDate: string | null;
	tagIds: string[];
	showDatePicker: boolean;
	calendarOpen: boolean;
};

type TaskFormAction =
	| { type: "setOpen"; value: boolean }
	| { type: "setTitle"; value: string }
	| { type: "setDescription"; value: string }
	| { type: "setPriority"; value: Priority }
	| { type: "setTagIds"; value: string[] }
	| { type: "setCalendarOpen"; value: boolean }
	| { type: "showDatePicker" }
	| { type: "pickDate"; value: string | null }
	| { type: "removeDueDate" }
	| { type: "reset" };

const initialTaskForm: TaskFormState = {
	open: false,
	title: "",
	description: "",
	priority: "none",
	dueDate: null,
	tagIds: [],
	showDatePicker: false,
	calendarOpen: false,
};

function taskFormReducer(
	state: TaskFormState,
	action: TaskFormAction,
): TaskFormState {
	switch (action.type) {
		case "setOpen":
			return { ...state, open: action.value };
		case "setTitle":
			return { ...state, title: action.value };
		case "setDescription":
			return { ...state, description: action.value };
		case "setPriority":
			return { ...state, priority: action.value };
		case "setTagIds":
			return { ...state, tagIds: action.value };
		case "setCalendarOpen":
			return { ...state, calendarOpen: action.value };
		case "showDatePicker":
			return { ...state, showDatePicker: true, calendarOpen: true };
		case "pickDate":
			return { ...state, dueDate: action.value, calendarOpen: false };
		case "removeDueDate":
			return { ...state, dueDate: null, showDatePicker: false };
		case "reset":
			return initialTaskForm;
	}
}

export function TaskForm({ children, projectId = null }: TaskFormProps) {
	const [form, dispatch] = useReducer(taskFormReducer, initialTaskForm);
	const {
		open,
		title,
		description,
		priority,
		dueDate,
		tagIds,
		showDatePicker,
		calendarOpen,
	} = form;
	const createTask = useTaskStore((s) => s.createTask);
	const { t, i18n } = useTranslation();

	async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!title.trim()) return;
		await createTask(getRepository(), {
			title: title.trim(),
			description: description || null,
			projectId: projectId ?? null,
			priority,
			dueDate: dueDate || null,
			tagIds,
		});
		dispatch({ type: "reset" });
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => dispatch({ type: "setOpen", value: isOpen })}
		>
			<DialogTrigger render={children} />
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("task.new")}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4 pt-2">
					<Input
						placeholder={t("task.titlePlaceholder")}
						value={title}
						onChange={(e) =>
							dispatch({ type: "setTitle", value: e.target.value })
						}
						autoFocus
					/>
					<div className="h-48 overflow-hidden rounded-md border border-input flex flex-col">
						<RichTextEditor
							value={description}
							onChange={(value) => dispatch({ type: "setDescription", value })}
							onBlur={() => {}}
							placeholder={t("task.descriptionPlaceholder")}
						/>
					</div>
					<TagSelector
						selectedTagIds={tagIds}
						onChange={(value) => dispatch({ type: "setTagIds", value })}
						projectId={projectId}
					/>
					<div className="flex gap-3">
						<Select
							value={priority}
							onValueChange={(v) =>
								dispatch({ type: "setPriority", value: v as Priority })
							}
						>
							<SelectTrigger className="flex-1">
								<SelectValue placeholder={t("priority.label")}>
									{(v: string) =>
										({
											none: t("priority.none"),
											low: t("priority.low"),
											medium: t("priority.medium"),
											high: t("priority.high"),
										})[v]
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{t("priority.none")}</SelectItem>
								<SelectItem value="low">{t("priority.low")}</SelectItem>
								<SelectItem value="medium">{t("priority.medium")}</SelectItem>
								<SelectItem value="high">{t("priority.high")}</SelectItem>
							</SelectContent>
						</Select>
						{showDatePicker ? (
							<div className="flex flex-1 gap-1 items-center">
								<Popover
									open={calendarOpen}
									onOpenChange={(value) =>
										dispatch({ type: "setCalendarOpen", value })
									}
								>
									<PopoverTrigger
										className={cn(
											buttonVariants({ variant: "ghost" }),
											"gap-2 justify-start flex-1",
										)}
									>
										<CalendarIcon className="h-4 w-4" />
										<span>
											{dueDate
												? formatDate(dueDate, i18n.language)
												: t("dueDate.label")}
										</span>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0" align="start">
										<Calendar
											mode="single"
											selected={
												dueDate
													? (() => {
															const [y, m, d] = dueDate.split("-").map(Number);
															return new Date(y, m - 1, d);
														})()
													: undefined
											}
											onSelect={(date) => {
												if (date) {
													const y = date.getFullYear();
													const mo = String(date.getMonth() + 1).padStart(
														2,
														"0",
													);
													const d = String(date.getDate()).padStart(2, "0");
													dispatch({
														type: "pickDate",
														value: `${y}-${mo}-${d}`,
													});
												} else {
													dispatch({ type: "pickDate", value: null });
												}
											}}
											locale={i18n.language === "fr" ? fr : undefined}
										/>
									</PopoverContent>
								</Popover>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => dispatch({ type: "removeDueDate" })}
									aria-label={t("dueDate.remove")}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						) : (
							<Button
								type="button"
								variant="ghost"
								className="flex-1 justify-start text-muted-foreground"
								onClick={() => dispatch({ type: "showDatePicker" })}
							>
								+ {t("task.addDate")}
							</Button>
						)}
					</div>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => dispatch({ type: "setOpen", value: false })}
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={!title.trim()}>
							{t("common.create")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
