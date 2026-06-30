// Extracted from ArchiveDateFilter.tsx so that component file exports only its
// component — react-refresh (Fast Refresh) can only hot-update modules whose
// exports are all components. This holds the pure date-range filter helpers.

export type DateRange = { from: string | null; to: string | null };

export function inRange(
	date: string | null,
	range: DateRange,
	today: string,
): boolean {
	if (!range.from && !range.to) return true;
	if (!date) return false;
	const from = range.from ?? "0000-01-01";
	const to = range.to ?? today;
	return date >= from && date <= to;
}
