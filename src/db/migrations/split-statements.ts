/**
 * Keywords that open a block terminated by END. BEGIN opens a trigger body,
 * CASE opens a CASE expression. Both are closed by END, so counting them the
 * same way keeps the depth arithmetic exact at any nesting level, with no need
 * to guess which construct a given END belongs to.
 */
const BLOCK_OPENERS = ["BEGIN", "CASE"] as const;

/**
 * Whether `keyword` occurs at `index` as a standalone word rather than inside a
 * longer identifier, so a column named `use_case` is not read as a CASE opener.
 */
function isKeywordAt(sql: string, index: number, keyword: string): boolean {
	const before = sql[index - 1];
	if (before !== undefined && /\w/.test(before)) return false;

	const end = index + keyword.length;
	if (sql.slice(index, end).toUpperCase() !== keyword) return false;

	const after = sql[end];
	return after === undefined || !/\w/.test(after);
}

/**
 * Split a migration file into executable statements.
 *
 * A naive split on ";" breaks CREATE TRIGGER: its BEGIN…END body contains
 * semicolons that belong to the trigger, not to the migration. This scanner
 * tracks single-quoted literals and BEGIN/CASE…END nesting so trigger bodies
 * stay whole.
 *
 * @throws if the SQL ends inside an unclosed block or string literal. Staying
 * silent there would merge every following statement into one malformed
 * fragment, surfacing later as a confusing SQL error against a real database.
 */
export function splitStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let inString = false;
	let blockDepth = 0;

	for (let i = 0; i < sql.length; i++) {
		const char = sql[i];

		// Copy comments through verbatim without interpreting them: prose like
		// "-- SQLite can't alter a CHECK" would otherwise open a phantom string
		// literal, and a ";" in a comment would end the statement early.
		if (!inString && char === "-" && sql[i + 1] === "-") {
			const newline = sql.indexOf("\n", i);
			const stop = newline === -1 ? sql.length : newline;
			current += sql.slice(i, stop);
			i = stop - 1;
			continue;
		}

		if (!inString && char === "/" && sql[i + 1] === "*") {
			const close = sql.indexOf("*/", i + 2);
			// Unlike a line comment, which legitimately ends at EOF, a block comment
			// reaching EOF has swallowed the rest of the file rather than closed.
			if (close === -1) {
				throw new Error("Unterminated block comment in migration SQL");
			}
			const stop = close + 2;
			current += sql.slice(i, stop);
			i = stop - 1;
			continue;
		}

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
			if (BLOCK_OPENERS.some((keyword) => isKeywordAt(sql, i, keyword)))
				blockDepth++;
			else if (isKeywordAt(sql, i, "END") && blockDepth > 0) blockDepth--;

			if (char === ";" && blockDepth === 0) {
				const trimmed = current.trim();
				if (trimmed) statements.push(trimmed);
				current = "";
				continue;
			}
		}

		current += char;
	}

	// Name the condition that tripped so a broken migration is diagnosable
	// without re-reading the whole file.
	if (inString) {
		throw new Error("Unterminated string literal in migration SQL");
	}
	if (blockDepth !== 0) {
		throw new Error(
			`Unterminated BEGIN/CASE block in migration SQL (${blockDepth} block(s) left open)`,
		);
	}

	const tail = current.trim();
	if (tail) statements.push(tail);
	return statements;
}
