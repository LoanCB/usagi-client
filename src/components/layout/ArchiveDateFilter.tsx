import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange as RdpRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";
import type { DateRange } from "@/components/layout/archive-date-range";
import { buttonVariants } from "@/components/ui/button-variants";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDate, todayIso } from "@/lib/utils";

function dateToIso(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function isoToDate(iso: string): Date {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d);
}

function buildPresets(today: string) {
	const base = isoToDate(today);
	const d7 = new Date(base);
	d7.setDate(d7.getDate() - 7);
	const d30 = new Date(base);
	d30.setDate(d30.getDate() - 30);
	const firstOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
	return [
		{ key: "7d" as const, from: dateToIso(d7), to: today },
		{ key: "30d" as const, from: dateToIso(d30), to: today },
		{ key: "month" as const, from: dateToIso(firstOfMonth), to: today },
	];
}

interface DateSectionProps {
	label: string;
	range: DateRange;
	onChange: (r: DateRange) => void;
	presetLabels: [string, string, string];
	presets: ReturnType<typeof buildPresets>;
	locale: typeof fr | undefined;
	lang: string;
	fromPlaceholder: string;
	toPlaceholder: string;
}

function DateSection({
	label,
	range,
	onChange,
	presetLabels,
	presets,
	locale,
	lang,
	fromPlaceholder,
	toPlaceholder,
}: DateSectionProps) {
	const rdpSelected: RdpRange | undefined =
		range.from || range.to
			? {
					from: range.from ? isoToDate(range.from) : undefined,
					to: range.to ? isoToDate(range.to) : undefined,
				}
			: undefined;

	return (
		<div className="space-y-2">
			<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
				{label}
			</p>
			<div className="flex flex-wrap gap-1">
				{presets.map((preset, i) => {
					const active = range.from === preset.from && range.to === preset.to;
					return (
						<button
							key={preset.key}
							type="button"
							onClick={() =>
								onChange(
									active
										? { from: null, to: null }
										: { from: preset.from, to: preset.to },
								)
							}
							className={cn(
								"rounded-full border px-2.5 py-0.5 text-xs transition-colors",
								active
									? "border-primary/40 bg-primary/15 text-primary"
									: "border-border/40 text-muted-foreground hover:text-foreground",
							)}
						>
							{presetLabels[i]}
						</button>
					);
				})}
			</div>
			<div className="flex items-center gap-2 text-sm">
				<span
					className={
						range.from
							? "text-foreground font-medium"
							: "text-muted-foreground/70"
					}
				>
					{range.from ? formatDate(range.from, lang) : fromPlaceholder}
				</span>
				<span className="text-muted-foreground">→</span>
				<span
					className={
						range.to
							? "text-foreground font-medium"
							: "text-muted-foreground/70"
					}
				>
					{range.to ? formatDate(range.to, lang) : toPlaceholder}
				</span>
			</div>
			<Calendar
				mode="range"
				selected={rdpSelected}
				onSelect={(rdp) =>
					onChange({
						from: rdp?.from ? dateToIso(rdp.from) : null,
						to: rdp?.to ? dateToIso(rdp.to) : null,
					})
				}
				locale={locale}
			/>
		</div>
	);
}

interface ArchiveDateFilterProps {
	archivedRange: DateRange;
	onArchivedRangeChange: (r: DateRange) => void;
	dueDateRange: DateRange;
	onDueDateRangeChange: (r: DateRange) => void;
}

export function ArchiveDateFilter({
	archivedRange,
	onArchivedRangeChange,
	dueDateRange,
	onDueDateRangeChange,
}: ArchiveDateFilterProps) {
	const { t, i18n } = useTranslation();
	const [open, setOpen] = useState(false);
	const locale = i18n.language === "fr" ? fr : undefined;
	const lang = i18n.language;

	const activeCount =
		(archivedRange.from || archivedRange.to ? 1 : 0) +
		(dueDateRange.from || dueDateRange.to ? 1 : 0);
	const isActive = activeCount > 0;

	const presets = useMemo(() => buildPresets(todayIso()), []);
	const presetLabels: [string, string, string] = [
		t("archive.preset7d"),
		t("archive.preset30d"),
		t("archive.presetMonth"),
	];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"w-36 h-7 px-2.5 text-xs border gap-1.5",
					isActive
						? "border-primary/40 bg-primary/15 text-primary"
						: "border-border/40 text-muted-foreground",
				)}
			>
				<CalendarIcon className="h-3.5 w-3.5 shrink-0" />
				<span className="flex-1 truncate text-left">
					{isActive
						? `${t("archive.filterDates")} · ${activeCount}`
						: t("archive.filterDates")}
				</span>
				<span className="text-[10px] opacity-40">▾</span>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="end">
				<div className="flex items-start gap-4">
					<DateSection
						label={t("archive.filterArchivedDate")}
						range={archivedRange}
						onChange={onArchivedRangeChange}
						presetLabels={presetLabels}
						presets={presets}
						locale={locale}
						lang={lang}
						fromPlaceholder={t("archive.fromPlaceholder")}
						toPlaceholder={t("archive.toPlaceholder")}
					/>
					<div className="w-px self-stretch bg-border/50" />
					<DateSection
						label={t("dueDate.label")}
						range={dueDateRange}
						onChange={onDueDateRangeChange}
						presetLabels={presetLabels}
						presets={presets}
						locale={locale}
						lang={lang}
						fromPlaceholder={t("archive.fromPlaceholder")}
						toPlaceholder={t("archive.toPlaceholder")}
					/>
				</div>
				{isActive && (
					<>
						<div className="h-px bg-border/50 mt-4" />
						<button
							type="button"
							onClick={() => {
								onArchivedRangeChange({ from: null, to: null });
								onDueDateRangeChange({ from: null, to: null });
							}}
							className="mt-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
						>
							{t("filter.reset")}
						</button>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
