import { isMac } from "@/lib/utils";

export interface SortShortcut {
	key: string | null; // null = disabled
	meta: boolean; // Cmd on Mac, Win key on Windows/Linux
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
}

// On macOS, the primary modifier is Cmd (meta). On Windows/Linux it's Ctrl.
const _mac = isMac();
export const DEFAULT_SHORTCUTS: Record<
	"sortUrgency" | "sortDueDate" | "sortProject",
	SortShortcut
> = {
	sortUrgency: { key: "s", meta: _mac, ctrl: !_mac, alt: false, shift: false },
	sortDueDate: { key: "d", meta: _mac, ctrl: !_mac, alt: false, shift: false },
	sortProject: { key: "p", meta: _mac, ctrl: !_mac, alt: false, shift: false },
};

export function matchesShortcut(e: KeyboardEvent, s: SortShortcut): boolean {
	if (!s.key) return false;
	return (
		e.key.toLowerCase() === s.key.toLowerCase() &&
		e.metaKey === s.meta &&
		e.ctrlKey === s.ctrl &&
		e.altKey === s.alt &&
		e.shiftKey === s.shift
	);
}

// Returns a display string like "⌘S" (macOS) or "Ctrl+S" (Windows/Linux), or "" if disabled.
// The optional `mac` parameter defaults to auto-detecting the current platform via isMac().
export function formatShortcut(s: SortShortcut, mac = isMac()): string {
	if (!s.key) return "";
	if (mac) {
		const parts: string[] = [];
		if (s.meta) parts.push("⌘");
		if (s.ctrl) parts.push("⌃");
		if (s.alt) parts.push("⌥");
		if (s.shift) parts.push("⇧");
		parts.push(s.key.toUpperCase());
		return parts.join("");
	}
	const parts: string[] = [];
	if (s.meta) parts.push("Win");
	if (s.ctrl) parts.push("Ctrl");
	if (s.alt) parts.push("Alt");
	if (s.shift) parts.push("Shift");
	parts.push(s.key.toUpperCase());
	return parts.join("+");
}
