/**
 * Positions (1-indexed) the user must retype to prove they saved the recovery
 * key. Random rather than fixed: fixed positions would let a user note only
 * those three words and still get through.
 *
 * `random` is injected so tests are deterministic — Math.random is the default.
 */
export function pickConfirmationPositions(
	wordCount: number,
	howMany: number,
	random: () => number = Math.random,
): number[] {
	const target = Math.min(howMany, wordCount);
	const picked = new Set<number>();
	// Draw, then top up in order: a pure rejection loop with a constant `random`
	// (as tests inject) would never terminate.
	while (picked.size < target) {
		const next = Math.floor(random() * wordCount) + 1;
		if (picked.has(next)) {
			for (let candidate = 1; candidate <= wordCount; candidate++) {
				if (!picked.has(candidate)) {
					picked.add(candidate);
					break;
				}
			}
		} else {
			picked.add(next);
		}
	}
	return [...picked].sort((a, b) => a - b);
}
