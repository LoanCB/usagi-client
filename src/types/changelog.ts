// A single changelog line, held in both supported languages.
export interface ChangelogEntry {
	en: string;
	fr: string;
}

export type ChangeCategory = "features" | "fixes" | "performance";

// A category key is present only when it has at least one entry.
export type ChangelogChanges = Partial<
	Record<ChangeCategory, ChangelogEntry[]>
>;

export interface ChangelogVersion {
	version: string;
	// null for the "Unreleased" entry.
	tag: string | null;
	// ISO date (YYYY-MM-DD), null for "Unreleased".
	date: string | null;
	changes: ChangelogChanges;
}

export interface Changelog {
	generatedAt: string;
	versions: ChangelogVersion[];
}
