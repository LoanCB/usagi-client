import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import type { VaultApi, VaultStatus } from "@/vault";
import { VaultGate } from "./VaultGate";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");
const status = (over: Partial<VaultStatus>): VaultStatus => ({
	state: "password",
	migrating: false,
	syncBound: false,
	brokenReason: null,
	...over,
});

function api(over: Partial<VaultApi> = {}): VaultApi {
	return {
		status: vi.fn(async () => status({})),
		setupKeychain: vi.fn(async () => {}),
		setupPassword: vi.fn(async () => PHRASE),
		unlockKeychain: vi.fn(async () => {}),
		unlockPassword: vi.fn(async () => {}),
		unlockRecovery: vi.fn(async () => {}),
		setPassword: vi.fn(async () => PHRASE),
		changePassword: vi.fn(async () => {}),
		removePassword: vi.fn(async () => {}),
		...over,
	};
}

const APP = <p>the app</p>;
const pw = () => screen.getByLabelText(/^password$|^mot de passe$/i);

describe("VaultGate", () => {
	it("never renders the app before the database is open", async () => {
		render(<VaultGate api={api()}>{APP}</VaultGate>);
		await screen.findByRole("button", { name: /^unlock$|^déverrouiller$/i });
		expect(screen.queryByText("the app")).not.toBeInTheDocument();
	});

	it("unlocks with the right password", async () => {
		const user = userEvent.setup();
		const a = api();
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.type(
			await screen.findByLabelText(/^password$|^mot de passe$/i),
			"pw",
		);
		await user.click(
			screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i }),
		);
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockPassword).toHaveBeenCalledWith("pw");
	});

	it("says so on a wrong password and stays locked", async () => {
		const user = userEvent.setup();
		const a = api({
			unlockPassword: vi.fn(async () => {
				throw { code: "wrong-secret" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.type(
			await screen.findByLabelText(/^password$|^mot de passe$/i),
			"nope",
		);
		await user.click(
			screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i }),
		);
		expect(
			await screen.findByText(/did not work|n'a pas fonctionné/i),
		).toBeInTheDocument();
		expect(screen.queryByText("the app")).not.toBeInTheDocument();
	});

	it("unlocks by itself in keychain mode, once", async () => {
		const a = api({ status: vi.fn(async () => status({ state: "keychain" })) });
		render(<VaultGate api={a}>{APP}</VaultGate>);
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockKeychain).toHaveBeenCalledTimes(1);
	});

	it("offers a retry when the keychain refuses", async () => {
		const user = userEvent.setup();
		const unlockKeychain = vi
			.fn()
			.mockRejectedValueOnce({ code: "keychain-denied", detail: "x" })
			.mockResolvedValueOnce(undefined);
		render(
			<VaultGate
				api={api({
					status: vi.fn(async () => status({ state: "keychain" })),
					unlockKeychain,
				})}
			>
				{APP}
			</VaultGate>,
		);
		await user.click(
			await screen.findByRole("button", { name: /try again|réessayer/i }),
		);
		expect(await screen.findByText("the app")).toBeInTheDocument();
	});

	it("sets up without a password on a fresh install", async () => {
		const user = userEvent.setup();
		const a = api({ status: vi.fn(async () => status({ state: "fresh" })) });
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(
			await screen.findByRole("button", {
				name: /without a password|sans mot de passe/i,
			}),
		);
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.setupKeychain).toHaveBeenCalled();
	});

	it("refuses mismatched passwords at setup", async () => {
		const user = userEvent.setup();
		const a = api({ status: vi.fn(async () => status({ state: "fresh" })) });
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.type(
			await screen.findByLabelText(/^password$|^mot de passe$/i),
			"one",
		);
		await user.type(screen.getByLabelText(/confirm/i), "two");
		await user.click(
			screen.getByRole("button", { name: /protect with|protéger par/i }),
		);
		expect(
			screen.getByText(/do not match|ne correspondent pas/i),
		).toBeInTheDocument();
		expect(a.setupPassword).not.toHaveBeenCalled();
	});

	it("shows the recovery key after a password setup and opens only once it is confirmed", async () => {
		const user = userEvent.setup();
		const a = api({
			status: vi.fn(async () => status({ state: "legacy-plaintext" })),
		});
		render(
			<VaultGate api={a} random={() => 0}>
				{APP}
			</VaultGate>,
		);
		expect(
			await screen.findByText(
				/will now be encrypted|vont désormais être chiffrées/i,
			),
		).toBeInTheDocument();
		await user.type(pw(), "pw");
		await user.type(screen.getByLabelText(/confirm/i), "pw");
		await user.click(
			screen.getByRole("button", { name: /protect with|protéger par/i }),
		);
		expect(await screen.findByText("word24")).toBeInTheDocument();
		expect(screen.queryByText("the app")).not.toBeInTheDocument();
		expect(a.setupPassword).toHaveBeenCalledWith("pw");
	});

	it("recovers with the phrase and a new password", async () => {
		const user = userEvent.setup();
		const a = api();
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(
			await screen.findByRole("button", { name: /forgot|oublié/i }),
		);
		await user.type(
			screen.getByLabelText(/recovery key|clé de récupération/i),
			PHRASE,
		);
		await user.type(
			screen.getByLabelText(/^new password$|^nouveau mot de passe$/i),
			"n",
		);
		await user.type(screen.getByLabelText(/confirm/i), "n");
		await user.click(
			screen.getByRole("button", {
				name: /set password|définir le mot de passe/i,
			}),
		);
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockRecovery).toHaveBeenCalledWith(PHRASE, "n");
	});

	it("explains a broken vault and offers nothing to click", async () => {
		render(
			<VaultGate
				api={api({
					status: vi.fn(async () =>
						status({ state: "broken", brokenReason: "vault-missing" }),
					),
				})}
			>
				{APP}
			</VaultGate>,
		);
		expect(await screen.findByText(/vault\.json/)).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("reports a failed migration without losing the form", async () => {
		const user = userEvent.setup();
		const a = api({
			status: vi.fn(async () => status({ state: "fresh" })),
			setupKeychain: vi.fn(async () => {
				throw { code: "migration-failed", detail: "disk full" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(
			await screen.findByRole("button", {
				name: /without a password|sans mot de passe/i,
			}),
		);
		await waitFor(() =>
			expect(
				screen.getByText(/nothing was lost|rien n'est perdu/i),
			).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", {
				name: /without a password|sans mot de passe/i,
			}),
		).toBeEnabled();
	});

	it("re-reads the status after a failed migration and keeps the setup form", async () => {
		const user = userEvent.setup();
		const statusFn = vi
			.fn()
			.mockResolvedValueOnce(status({ state: "legacy-plaintext" }))
			.mockResolvedValueOnce(status({ state: "legacy-plaintext" }));
		const a = api({
			status: statusFn,
			setupPassword: vi.fn(async () => {
				throw { code: "migration-failed", detail: "disk full" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.type(
			await screen.findByLabelText(/^password$|^mot de passe$/i),
			"pw",
		);
		await user.type(screen.getByLabelText(/confirm/i), "pw");
		await user.click(
			screen.getByRole("button", { name: /protect with|protéger par/i }),
		);
		expect(
			await screen.findByText(/nothing was lost|rien n'est perdu/i),
		).toBeInTheDocument();
		expect(statusFn).toHaveBeenCalledTimes(2);
		expect(
			screen.getByText(/will now be encrypted|vont désormais être chiffrées/i),
		).toBeInTheDocument();
	});

	it("shows an error and retries when the status cannot be read", async () => {
		const user = userEvent.setup();
		const statusFn = vi
			.fn()
			.mockRejectedValueOnce({ code: "io", detail: "boom" })
			.mockResolvedValueOnce(status({ state: "keychain" }));
		const a = api({ status: statusFn });
		render(<VaultGate api={a}>{APP}</VaultGate>);
		expect(await screen.findByText(/boom/)).toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: /try again|réessayer/i }),
		);
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockKeychain).toHaveBeenCalledTimes(1);
	});

	it("keeps the recovery form and its input after a failed migration", async () => {
		const user = userEvent.setup();
		const a = api({
			unlockRecovery: vi.fn(async () => {
				throw { code: "migration-failed" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(
			await screen.findByRole("button", { name: /forgot|oublié/i }),
		);
		await user.type(
			screen.getByLabelText(/recovery key|clé de récupération/i),
			PHRASE,
		);
		await user.type(
			screen.getByLabelText(/^new password$|^nouveau mot de passe$/i),
			"n",
		);
		await user.type(screen.getByLabelText(/confirm/i), "n");
		await user.click(
			screen.getByRole("button", {
				name: /set password|définir le mot de passe/i,
			}),
		);
		expect(
			await screen.findByText(/nothing was lost|rien n'est perdu/i),
		).toBeInTheDocument();
		expect(
			screen.getByLabelText(/recovery key|clé de récupération/i),
		).toHaveValue(PHRASE);
	});

	it("routes a corrupt keychain unlock to the broken screen", async () => {
		const a = api({
			status: vi.fn(async () => status({ state: "keychain" })),
			unlockKeychain: vi.fn(async () => {
				throw { code: "corrupt" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		expect(await screen.findByText(/vault\.json/)).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("disables the keychain retry while an unlock is in flight", async () => {
		const user = userEvent.setup();
		let release: () => void = () => {};
		const unlockKeychain = vi
			.fn()
			.mockRejectedValueOnce({ code: "keychain-denied" })
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						release = resolve;
					}),
			);
		render(
			<VaultGate
				api={api({
					status: vi.fn(async () => status({ state: "keychain" })),
					unlockKeychain,
				})}
			>
				{APP}
			</VaultGate>,
		);
		const retry = await screen.findByRole("button", {
			name: /try again|réessayer/i,
		});
		await user.click(retry);
		await waitFor(() => expect(retry).toBeDisabled());
		await user.click(retry);
		expect(unlockKeychain).toHaveBeenCalledTimes(2);
		release();
		expect(await screen.findByText("the app")).toBeInTheDocument();
	});

	it("starts the keychain unlock once under StrictMode", async () => {
		const a = api({ status: vi.fn(async () => status({ state: "keychain" })) });
		render(
			<StrictMode>
				<VaultGate api={a}>{APP}</VaultGate>
			</StrictMode>,
		);
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockKeychain).toHaveBeenCalledTimes(1);
	});

	it("says the key could not be saved when a no-password setup is refused", async () => {
		const user = userEvent.setup();
		const a = api({
			status: vi.fn(async () => status({ state: "fresh" })),
			setupKeychain: vi.fn(async () => {
				throw { code: "keychain-denied", detail: "no default keychain" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(
			await screen.findByRole("button", {
				name: /without a password|sans mot de passe/i,
			}),
		);
		expect(
			await screen.findByText(
				/could not save its key|n'a pas pu enregistrer sa clé/i,
			),
		).toBeInTheDocument();
	});

	it("says the key could not be read when the keychain unlock is refused", async () => {
		render(
			<VaultGate
				api={api({
					status: vi.fn(async () => status({ state: "keychain" })),
					unlockKeychain: vi.fn(async () => {
						throw { code: "keychain-denied" };
					}),
				})}
			>
				{APP}
			</VaultGate>,
		);
		expect(
			await screen.findByText(/could not read its key|n'a pas pu lire sa clé/i),
		).toBeInTheDocument();
	});
});
