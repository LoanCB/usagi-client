import i18n from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import "@/i18n";
import { SyncHttpError, SyncNetworkError } from "@/sync/http";
import { registerErrorMessage } from "./register-error";

const http = (status: number) => new SyncHttpError(status, null, null, "x");

describe("registerErrorMessage", () => {
	beforeAll(async () => {
		await i18n.changeLanguage("en");
	});
	const t = i18n.t.bind(i18n);

	it("says the email is taken on 409", () => {
		expect(registerErrorMessage(t, http(409), true)).toMatch(
			/already exists with this email/i,
		);
	});

	it("blames the invite token on 400 when one was sent", () => {
		expect(registerErrorMessage(t, http(400), true)).toMatch(/invite token/i);
	});

	it("does not blame a token that was never sent", () => {
		expect(registerErrorMessage(t, http(400), false)).not.toMatch(
			/invite token/i,
		);
	});

	it("explains closed registration on 403", () => {
		expect(registerErrorMessage(t, http(403), false)).toMatch(/invite token/i);
	});

	it("asks to wait on 429", () => {
		expect(registerErrorMessage(t, http(429), true)).toMatch(/too many/i);
	});

	it("reports an unreachable server on a network error", () => {
		expect(
			registerErrorMessage(t, new SyncNetworkError("offline"), true),
		).toMatch(/could not reach/i);
	});

	it("falls back to a generic message", () => {
		const message = registerErrorMessage(t, new Error("boom"), true);
		expect(message).toMatch(/could not create the account/i);
		expect(message).not.toMatch(/invite token/i);
	});
});
