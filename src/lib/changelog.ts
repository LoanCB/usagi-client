import changelogData from "@/assets/changelog.json";
import type {
	Changelog,
	ChangelogEntry,
	ChangelogVersion,
} from "@/types/changelog";

const changelog = changelogData as Changelog;

// Versions shown in the changelog view: any with at least one change,
// including the not-yet-released entry (tag: null, shown as "latest version").
// Excludes versions whose commits were all non-user-facing (empty changes).
export function getDisplayVersions(): ChangelogVersion[] {
	return changelog.versions.filter((v) => Object.keys(v.changes).length > 0);
}

// Released versions only: real tags with at least one change. Drives the
// post-update popup, which never surfaces the unreleased entry.
export function getReleasedVersions(): ChangelogVersion[] {
	return changelog.versions.filter(
		(v) => v.tag !== null && Object.keys(v.changes).length > 0,
	);
}

// Released versions newer than `version` (relies on the file being ordered
// newest-first). Falls back to the full history if the marker is unknown.
export function getVersionsSince(version: string): ChangelogVersion[] {
	const released = getReleasedVersions();
	const index = released.findIndex((v) => v.version === version);
	if (index === -1) return released;
	return released.slice(0, index);
}

export function localizeEntry(entry: ChangelogEntry, lang: string): string {
	// Fallback to English, matching i18n's fallbackLng.
	return lang.startsWith("fr") ? entry.fr : entry.en;
}
