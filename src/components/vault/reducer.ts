import type { Action, State } from "./types";

export function reducer(state: State, action: Action): State {
	switch (action.type) {
		case "loading":
			return { screen: { kind: "loading" }, busy: false, error: null };
		case "status": {
			// A re-read after a failure must not unmount the recovery form and
			// drop what the user typed.
			const recovering =
				action.preserveRecovering === true &&
				state.screen.kind === "status" &&
				state.screen.recovering;
			return {
				screen: { kind: "status", status: action.status, recovering },
				busy: false,
				error: null,
			};
		}
		case "status-failed":
			return {
				screen: { kind: "status-error", message: action.message },
				busy: false,
				error: null,
			};
		case "busy":
			return { ...state, busy: true, error: null };
		case "failed":
			return { ...state, busy: false, error: action.message };
		case "keychain-failed":
			return {
				screen: { kind: "retry-keychain", message: action.message },
				busy: false,
				error: null,
			};
		case "phrase":
			return {
				screen: { kind: "phrase", phrase: action.phrase },
				busy: false,
				error: null,
			};
		case "recovering":
			return state.screen.kind === "status"
				? {
						...state,
						screen: { ...state.screen, recovering: action.value },
						error: null,
					}
				: state;
		case "open":
			return { screen: { kind: "open" }, busy: false, error: null };
	}
}
