import { useState } from "react";
import { isStrongPassword } from "@/lib/password-strength";
import { WeakPasswordDialog } from "./weak-password-dialog";

/**
 * Runs `action` right away for a strong password; otherwise holds it until the
 * user confirms the warning dialog. Render `dialog` next to the form.
 */
export function useWeakPasswordGuard() {
	// Wrapped in an object: a bare function state value would be invoked by setState.
	const [pending, setPending] = useState<{ run: () => void } | null>(null);

	function guard(password: string, action: () => void) {
		if (isStrongPassword(password)) action();
		else setPending({ run: action });
	}

	const dialog = (
		<WeakPasswordDialog
			open={pending !== null}
			onConfirm={() => {
				const current = pending;
				setPending(null);
				current?.run();
			}}
			onCancel={() => setPending(null)}
		/>
	);

	return { guard, dialog };
}
