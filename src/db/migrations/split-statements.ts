/**
 * Split a migration file into executable statements.
 *
 * A naive split on ";" breaks CREATE TRIGGER: its BEGIN…END body contains
 * semicolons that belong to the trigger, not to the migration. This scanner
 * tracks single-quoted literals and BEGIN…END nesting so trigger bodies stay
 * whole.
 */
export function splitStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let inString = false;
	let blockDepth = 0;

	for (let i = 0; i < sql.length; i++) {
		const char = sql[i];

		if (char === "'") {
			// Doubled quotes ('') are an escaped quote inside a literal, not a close.
			if (inString && sql[i + 1] === "'") {
				current += "''";
				i++;
				continue;
			}
			inString = !inString;
			current += char;
			continue;
		}

		if (!inString) {
			const ahead = sql.slice(i);
			if (/^\bBEGIN\b/i.test(ahead)) blockDepth++;
			else if (/^\bEND\b/i.test(ahead) && blockDepth > 0) blockDepth--;

			if (char === ";" && blockDepth === 0) {
				const trimmed = current.trim();
				if (trimmed) statements.push(trimmed);
				current = "";
				continue;
			}
		}

		current += char;
	}

	const tail = current.trim();
	if (tail) statements.push(tail);
	return statements;
}
