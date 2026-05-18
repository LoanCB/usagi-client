import {
	ChevronDown,
	ChevronUp,
	Monitor,
	Moon,
	Plus,
	RotateCcw,
	Sun,
	Trash2,
	X,
} from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { formatShortcut, type SortShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { type NotificationTime, useSettingsStore } from "@/store/settings";
import { type ShortcutAction, useShortcutsStore } from "@/store/shortcuts";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeMode } from "@/theme/types";

interface SettingsDialogProps {
	readonly children: ReactElement;
}

interface TimeSegmentProps {
	readonly field: "hour" | "minute";
	readonly value: number;
	readonly step: number;
	readonly onAdj: (delta: number) => void;
	readonly onSet: (val: number) => void;
}

function TimeSegment({ field, value, step, onAdj, onSet }: TimeSegmentProps) {
	const [draft, setDraft] = useState<string | null>(null);
	const max = field === "hour" ? 23 : 59;

	function commit(raw: string) {
		const n = parseInt(raw, 10);
		if (!Number.isNaN(n)) onSet(Math.min(max, Math.max(0, n)));
		setDraft(null);
	}

	return (
		<div className="flex flex-col items-center">
			<button
				type="button"
				onClick={() => onAdj(step)}
				className="h-4 w-5 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors"
			>
				<ChevronUp className="h-3 w-3" />
			</button>
			<input
				type="text"
				inputMode="numeric"
				maxLength={2}
				value={draft ?? String(value).padStart(2, "0")}
				onFocus={(e) => {
					setDraft(String(value).padStart(2, "0"));
					e.target.select();
				}}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={(e) => commit(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						commit(draft ?? "");
						e.currentTarget.blur();
					}
					if (e.key === "Escape") {
						setDraft(null);
						e.currentTarget.blur();
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						onAdj(step);
					}
					if (e.key === "ArrowDown") {
						e.preventDefault();
						onAdj(-step);
					}
				}}
				className="font-mono text-sm leading-snug w-5 text-center bg-transparent border-none outline-none cursor-text"
				aria-label={field === "hour" ? "Heures" : "Minutes"}
			/>
			<button
				type="button"
				onClick={() => onAdj(-step)}
				className="h-4 w-5 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors"
			>
				<ChevronDown className="h-3 w-3" />
			</button>
		</div>
	);
}

interface TimeSlotRowProps {
	readonly slot: NotificationTime;
	readonly onUpdate: (updated: NotificationTime) => void;
	readonly onRemove: () => void;
	readonly removeLabel: string;
	readonly toggleLabel: string;
}

function TimeSlotRow({
	slot,
	onUpdate,
	onRemove,
	removeLabel,
	toggleLabel,
}: TimeSlotRowProps) {
	const isEnabled = slot.enabled !== false;

	function adj(field: "hour" | "minute", delta: number) {
		if (field === "hour")
			onUpdate({ ...slot, hour: (slot.hour + delta + 24) % 24 });
		else onUpdate({ ...slot, minute: (slot.minute + delta + 60) % 60 });
	}

	return (
		<div className="flex items-center gap-2">
			<Checkbox
				checked={isEnabled}
				onCheckedChange={(checked) =>
					onUpdate({ ...slot, enabled: checked === true })
				}
				aria-label={toggleLabel}
			/>
			<div
				className={cn(
					"flex items-center rounded-lg border border-input bg-transparent px-1.5 dark:bg-input/30 gap-0.5 transition-opacity",
					!isEnabled && "opacity-40",
				)}
			>
				<TimeSegment
					field="hour"
					value={slot.hour}
					step={1}
					onAdj={(delta) => adj("hour", delta)}
					onSet={(val) => onUpdate({ ...slot, hour: val })}
				/>
				<span className="text-muted-foreground text-sm font-mono leading-none self-center">
					:
				</span>
				<TimeSegment
					field="minute"
					value={slot.minute}
					step={5}
					onAdj={(delta) => adj("minute", delta)}
					onSet={(val) => onUpdate({ ...slot, minute: val })}
				/>
			</div>

			<Button
				variant="ghost"
				size="icon"
				className="h-7 w-7 text-muted-foreground hover:text-destructive"
				onClick={onRemove}
				aria-label={removeLabel}
			>
				<Trash2 className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}

const THEME_MODES: {
	mode: ThemeMode;
	icon: React.ElementType;
	labelKey: "theme.light" | "theme.dark" | "theme.system";
}[] = [
	{ mode: "light", icon: Sun, labelKey: "theme.light" },
	{ mode: "dark", icon: Moon, labelKey: "theme.dark" },
	{ mode: "system", icon: Monitor, labelKey: "theme.system" },
];

type CustomThemeLabelKey =
	| "theme.luxury"
	| "theme.nature"
	| "theme.dracula"
	| "theme.retro"
	| "theme.ember"
	| "theme.deepOcean"
	| "theme.ocean";
const CUSTOM_THEMES: {
	mode: ThemeMode;
	color: string;
	labelKey: CustomThemeLabelKey;
}[] = [
	{ mode: "luxury", color: "oklch(0.46 0.18 20)", labelKey: "theme.luxury" },
	{ mode: "nature", color: "oklch(0.59 0.19 145)", labelKey: "theme.nature" },
	{
		mode: "dracula",
		color: "oklch(0.716 0.171 295)",
		labelKey: "theme.dracula",
	},
	{ mode: "retro", color: "oklch(0.50 0.10 55)", labelKey: "theme.retro" },
	{ mode: "ember", color: "oklch(0.70 0.22 42)", labelKey: "theme.ember" },
	{
		mode: "deep-ocean",
		color: "oklch(0.70 0.14 193)",
		labelKey: "theme.deepOcean",
	},
	{ mode: "ocean", color: "oklch(0.62 0.15 193)", labelKey: "theme.ocean" },
];

function hasConflict(a: SortShortcut, b: SortShortcut): boolean {
	if (!a.key || !b.key) return false;
	return (
		a.key.toLowerCase() === b.key.toLowerCase() &&
		a.meta === b.meta &&
		a.ctrl === b.ctrl &&
		a.alt === b.alt &&
		a.shift === b.shift
	);
}

interface ShortcutInputProps {
	readonly shortcut: SortShortcut;
	readonly onChange: (s: SortShortcut) => void;
	readonly conflict: boolean;
}

function ShortcutInput({ shortcut, onChange, conflict }: ShortcutInputProps) {
	const { t } = useTranslation();
	const [recording, setRecording] = useState(false);
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	});

	useEffect(() => {
		if (!recording) return;
		const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

		function onKey(e: KeyboardEvent) {
			e.preventDefault();
			e.stopPropagation();
			if (MODIFIER_KEYS.has(e.key)) return;
			if (e.key === "Escape") {
				setRecording(false);
				return;
			}
			if (e.key === "Backspace" || e.key === "Delete") {
				onChangeRef.current({
					key: null,
					meta: false,
					ctrl: false,
					alt: false,
					shift: false,
				});
				setRecording(false);
				return;
			}
			onChangeRef.current({
				key: e.key.toLowerCase(),
				meta: e.metaKey,
				ctrl: e.ctrlKey,
				alt: e.altKey,
				shift: e.shiftKey,
			});
			setRecording(false);
		}

		globalThis.addEventListener("keydown", onKey, true);
		return () => globalThis.removeEventListener("keydown", onKey, true);
	}, [recording]);

	const label = shortcut.key ? formatShortcut(shortcut) : "—";
	const idleClass = conflict
		? "border-destructive text-foreground"
		: "border-input text-foreground hover:border-primary/50";

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={() => setRecording(true)}
					aria-label={recording ? t("settings.shortcutRecording") : label}
					aria-pressed={recording}
					className={cn(
						"min-w-[80px] h-7 px-2 rounded-md border text-xs font-mono text-left transition-colors",
						recording ? "border-primary bg-primary/10 text-primary" : idleClass,
					)}
				>
					{recording ? t("settings.shortcutRecording") : label}
				</button>
				{shortcut.key && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-destructive"
						onClick={() =>
							onChange({
								key: null,
								meta: false,
								ctrl: false,
								alt: false,
								shift: false,
							})
						}
						aria-label={t("settings.shortcutClear")}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				)}
			</div>
			{conflict && (
				<p className="text-[11px] text-destructive leading-none">
					{t("settings.shortcutConflict")}
				</p>
			)}
		</div>
	);
}

export function SettingsDialog({ children }: SettingsDialogProps) {
	const { t, i18n } = useTranslation();
	const { mode: themeMode, setMode: setThemeMode } = useTheme();
	const currentLang = i18n.language.startsWith("fr") ? "fr" : "en";
	const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
	const notificationTimes = useSettingsStore((s) => s.notificationTimes);
	const parallaxEnabled = useSettingsStore((s) => s.parallaxEnabled);
	const setNotificationsEnabled = useSettingsStore(
		(s) => s.setNotificationsEnabled,
	);
	const setNotificationTimes = useSettingsStore((s) => s.setNotificationTimes);
	const setParallaxEnabled = useSettingsStore((s) => s.setParallaxEnabled);
	const glassmorphismEnabled = useSettingsStore((s) => s.glassmorphismEnabled);
	const setGlassmorphismEnabled = useSettingsStore(
		(s) => s.setGlassmorphismEnabled,
	);
	const calendarVisible = useSettingsStore((s) => s.calendarVisible);
	const archivesVisible = useSettingsStore((s) => s.archivesVisible);
	const tagsVisible = useSettingsStore((s) => s.tagsVisible);
	const setCalendarVisible = useSettingsStore((s) => s.setCalendarVisible);
	const setArchivesVisible = useSettingsStore((s) => s.setArchivesVisible);
	const setTagsVisible = useSettingsStore((s) => s.setTagsVisible);

	const sortUrgency = useShortcutsStore((s) => s.sortUrgency);
	const sortDueDate = useShortcutsStore((s) => s.sortDueDate);
	const sortProject = useShortcutsStore((s) => s.sortProject);
	const setShortcut = useShortcutsStore((s) => s.setShortcut);
	const resetShortcuts = useShortcutsStore((s) => s.resetShortcuts);

	function handleShortcut(action: ShortcutAction, s: SortShortcut) {
		setShortcut(getRepository(), action, s);
	}

	const urgencyConflict =
		hasConflict(sortUrgency, sortDueDate) ||
		hasConflict(sortUrgency, sortProject);
	const dateConflict =
		hasConflict(sortDueDate, sortUrgency) ||
		hasConflict(sortDueDate, sortProject);
	const projectConflict =
		hasConflict(sortProject, sortUrgency) ||
		hasConflict(sortProject, sortDueDate);

	function handleToggleEnabled(checked: boolean) {
		setNotificationsEnabled(getRepository(), checked);
	}

	function handleUpdateTime(index: number, updated: NotificationTime) {
		const isDuplicate = notificationTimes.some(
			(t, i) =>
				i !== index && t.hour === updated.hour && t.minute === updated.minute,
		);
		if (isDuplicate) return;
		const next = notificationTimes.map((t, i) => (i === index ? updated : t));
		setNotificationTimes(getRepository(), next);
	}

	function handleRemoveTime(index: number) {
		const next = notificationTimes.filter((_, i) => i !== index);
		setNotificationTimes(getRepository(), next);
	}

	function handleAddTime() {
		const usedHours = new Set(notificationTimes.map((t) => t.hour));
		const freeHour = Array.from({ length: 24 }, (_, i) => i).find(
			(h) => !usedHours.has(h),
		);
		if (freeHour === undefined) return; // all 24 hours used
		setNotificationTimes(getRepository(), [
			...notificationTimes,
			{ hour: freeHour, minute: 0 },
		]);
	}

	return (
		<Dialog>
			<DialogTrigger render={children} />
			<DialogContent className="flex flex-col max-h-[85vh] sm:max-w-[min(calc(100%-2rem),42rem)]">
				<DialogHeader>
					<DialogTitle>{t("settings.title")}</DialogTitle>
				</DialogHeader>

				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col sm:flex-row">
					{/* Left column: Appearance, Language, Shortcuts */}
					<div className="flex-1 min-w-0 flex flex-col sm:pr-4">
						{/* Section: Appearance */}
						<div className="flex flex-col gap-3 pb-4">
							<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								{t("settings.appearance")}
							</p>
							<div className="flex gap-1">
								{THEME_MODES.map(({ mode, icon: Icon, labelKey }) => (
									<button
										key={mode}
										type="button"
										onClick={() => setThemeMode(mode)}
										aria-label={t(labelKey)}
										aria-pressed={themeMode === mode}
										className={cn(
											"flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors",
											themeMode === mode
												? "bg-primary text-primary-foreground"
												: "text-muted-foreground hover:text-foreground border border-input",
										)}
									>
										<Icon className="h-3.5 w-3.5" />
										{t(labelKey)}
									</button>
								))}
							</div>
							<div className="flex flex-wrap gap-1">
								{CUSTOM_THEMES.map(({ mode, color, labelKey }) => (
									<button
										key={mode}
										type="button"
										onClick={() => setThemeMode(mode)}
										aria-label={t(labelKey)}
										aria-pressed={themeMode === mode}
										style={{ flexBasis: "calc(33.333% - 0.167rem)" }}
										className={cn(
											"flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors",
											themeMode === mode
												? "bg-primary text-primary-foreground"
												: "text-muted-foreground hover:text-foreground border border-input",
										)}
									>
										<span
											className="h-3.5 w-3.5 rounded-full flex-shrink-0"
											style={{ background: color }}
											aria-hidden
										/>
										{t(labelKey)}
									</button>
								))}
							</div>
							<div className="flex items-center justify-between cursor-pointer select-none">
								<span className="text-sm text-foreground">
									{t("settings.glassmorphism")}
								</span>
								<Switch
									checked={glassmorphismEnabled}
									onCheckedChange={(v) =>
										setGlassmorphismEnabled(getRepository(), v)
									}
								/>
							</div>
							<div
								className={cn(
									"flex items-center justify-between cursor-pointer select-none",
									!glassmorphismEnabled && "pointer-events-none opacity-40",
								)}
							>
								<span className="text-sm text-foreground">
									{t("settings.parallax")}
								</span>
								<Switch
									checked={parallaxEnabled}
									onCheckedChange={(v) =>
										setParallaxEnabled(getRepository(), v)
									}
								/>
							</div>
						</div>

						<div className="h-px bg-border" />

						{/* Section: Language */}
						<div className="flex flex-col gap-3 py-4">
							<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								{t("settings.language")}
							</p>
							<div className="flex gap-1">
								{(["fr", "en"] as const).map((lang) => (
									<button
										key={lang}
										type="button"
										onClick={() => i18n.changeLanguage(lang)}
										aria-label={lang === "fr" ? "Français" : "English"}
										aria-pressed={currentLang === lang}
										className={cn(
											"flex-1 py-1.5 rounded-md text-xs font-medium uppercase transition-colors",
											currentLang === lang
												? "bg-primary text-primary-foreground"
												: "text-muted-foreground hover:text-foreground border border-input",
										)}
									>
										{lang}
									</button>
								))}
							</div>
						</div>

						<div className="h-px bg-border" />

						{/* Section: Shortcuts */}
						<div className="flex flex-col gap-3 pt-4">
							<div className="flex items-center justify-between">
								<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									{t("settings.shortcuts")}
								</p>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground -my-1"
									onClick={() => resetShortcuts(getRepository())}
								>
									<RotateCcw className="h-3 w-3" />
									{t("settings.shortcutsReset")}
								</Button>
							</div>
							<div className="flex flex-col gap-2">
								<div className="flex items-start justify-between gap-4">
									<span className="text-sm pt-1 min-w-0 shrink">
										{t("settings.shortcutUrgency")}
									</span>
									<ShortcutInput
										shortcut={sortUrgency}
										onChange={(s) => handleShortcut("sortUrgency", s)}
										conflict={urgencyConflict}
									/>
								</div>
								<div className="flex items-start justify-between gap-4">
									<span className="text-sm pt-1 min-w-0 shrink">
										{t("settings.shortcutDueDate")}
									</span>
									<ShortcutInput
										shortcut={sortDueDate}
										onChange={(s) => handleShortcut("sortDueDate", s)}
										conflict={dateConflict}
									/>
								</div>
								<div className="flex items-start justify-between gap-4">
									<span className="text-sm pt-1 min-w-0 shrink">
										{t("settings.shortcutProject")}
									</span>
									<ShortcutInput
										shortcut={sortProject}
										onChange={(s) => handleShortcut("sortProject", s)}
										conflict={projectConflict}
									/>
								</div>
							</div>
						</div>
					</div>

					{/* Divider: horizontal when stacked, vertical when side-by-side */}
					<div className="h-px bg-border sm:hidden" />
					<div className="hidden sm:block w-px bg-border flex-shrink-0" />

					{/* Right column: Notifications */}
					<div className="flex-1 min-w-0 flex flex-col pt-4 sm:pt-0 sm:pl-4">
						{/* Section: Sidebar views */}
						<div className="flex flex-col gap-3 pb-4">
							<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								{t("settings.sidebarViews")}
							</p>
							<div className="flex items-center justify-between cursor-pointer select-none">
								<span className="text-sm">{t("nav.calendar")}</span>
								<Switch
									aria-label={t("nav.calendar")}
									checked={calendarVisible}
									onCheckedChange={(v) =>
										setCalendarVisible(getRepository(), v)
									}
								/>
							</div>
							<div className="flex items-center justify-between cursor-pointer select-none">
								<span className="text-sm">{t("nav.archives")}</span>
								<Switch
									aria-label={t("nav.archives")}
									checked={archivesVisible}
									onCheckedChange={(v) =>
										setArchivesVisible(getRepository(), v)
									}
								/>
							</div>
							<div className="flex items-center justify-between cursor-pointer select-none">
								<span className="text-sm">{t("nav.tags")}</span>
								<Switch
									aria-label={t("nav.tags")}
									checked={tagsVisible}
									onCheckedChange={(v) => setTagsVisible(getRepository(), v)}
								/>
							</div>
						</div>

						<div className="h-px bg-border" />

						<div className="flex flex-col gap-3 pt-4">
							<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								{t("settings.notifications")}
							</p>

							{/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox which renders a native input */}
							<label className="flex items-center gap-3 cursor-pointer select-none">
								<Checkbox
									checked={notificationsEnabled}
									onCheckedChange={handleToggleEnabled}
								/>
								<span className="text-sm">
									{t("settings.enableNotifications")}
								</span>
							</label>

							<div
								className={cn(
									"flex flex-col gap-2",
									!notificationsEnabled && "pointer-events-none opacity-40",
								)}
							>
								<p className="text-xs text-muted-foreground">
									{t("settings.notificationTimes")}
								</p>

								{notificationTimes.map((slot, i) => (
									<TimeSlotRow
										key={`${slot.hour}:${slot.minute}`}
										slot={slot}
										onUpdate={(updated) => handleUpdateTime(i, updated)}
										onRemove={() => handleRemoveTime(i)}
										removeLabel={t("settings.removeTime")}
										toggleLabel={t("settings.toggleTime")}
									/>
								))}

								<Button
									variant="ghost"
									size="sm"
									className="w-fit text-muted-foreground"
									onClick={handleAddTime}
								>
									<Plus className="h-3.5 w-3.5 mr-1" />
									{t("settings.addTime")}
								</Button>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
