import type { TFunction } from "i18next";
import { SyncHttpError, SyncNetworkError } from "@/sync/http";

/**
 * Registration fails for reasons the user fixes differently; one catch-all
 * message used to send them hunting for a bad invite token when the email was
 * simply taken. Status codes are those of usagi-server's POST /v1/auth/register.
 */
export function registerErrorMessage(
	t: TFunction,
	error: unknown,
	sentInviteToken: boolean,
): string {
	if (error instanceof SyncNetworkError) return t("sync.unreachable");
	if (error instanceof SyncHttpError) {
		if (error.status === 409) return t("sync.registerEmailTaken");
		if (error.status === 403) return t("sync.registrationClosed");
		if (error.status === 429) return t("sync.registerTooManyAttempts");
		// The server checks the token before anything else, but a 400 without
		// one sent is a malformed request, not a token problem.
		if (error.status === 400 && sentInviteToken) {
			return t("sync.registerInviteInvalid");
		}
	}
	return t("sync.registerFailed");
}
