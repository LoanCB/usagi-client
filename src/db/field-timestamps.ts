/** When a field was last written, and by which device. */
export interface FieldStamp {
	t: string;
	d: string;
}

export type FieldStamps = Record<string, FieldStamp>;

/**
 * Merge new field stamps into the stored map.
 *
 * The device id is carried per field, not per row: it breaks ties when two
 * devices write the same field at the same instant, and a row-level id would
 * name the last pusher rather than the author of that field.
 */
export function stampFields(
	existing: string | null,
	fields: string[],
	now: string,
	deviceId: string,
): string {
	let stamps: FieldStamps = {};
	if (existing) {
		try {
			const parsed: unknown = JSON.parse(existing);
			if (parsed && typeof parsed === "object") stamps = parsed as FieldStamps;
		} catch {
			// Corrupt map: rebuild from this write rather than losing the row.
		}
	}
	for (const field of fields) stamps[field] = { t: now, d: deviceId };
	return JSON.stringify(stamps);
}
