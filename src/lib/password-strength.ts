const PASSPHRASE_MIN_WORDS = 3;
const PASSWORD_MIN_LENGTH = 8;

// Unicode-aware so accented letters count as letters, not symbols.
function isComplexPassword(password: string): boolean {
	return (
		password.length >= PASSWORD_MIN_LENGTH &&
		/\p{Ll}/u.test(password) &&
		/\p{Lu}/u.test(password) &&
		/[^\p{L}\p{N}]/u.test(password)
	);
}

function isPassphrase(password: string): boolean {
	return (
		password.split(/[\s-]+/).filter(Boolean).length >= PASSPHRASE_MIN_WORDS
	);
}

export function isStrongPassword(password: string): boolean {
	return isComplexPassword(password) || isPassphrase(password);
}
