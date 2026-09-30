export const SEALED_BACKUP_EXTENSION = "bunlybak";

/** Same stamp format the plaintext backups used, so they sort together. */
export function automaticBackupName(now: Date): string {
	const stamp = now.toISOString().slice(0, 19).replace(/:/g, "-");
	return `bunly-before-replace-${stamp}.${SEALED_BACKUP_EXTENSION}`;
}

/** A sealed backup only opens with this install's database key, in Rust. */
export async function readBackupText(
	path: string,
	raw: string,
	open: (blob: string) => Promise<string>,
): Promise<string> {
	return path.endsWith(`.${SEALED_BACKUP_EXTENSION}`) ? open(raw) : raw;
}
