import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import type { TodoRepository } from "@/db/repository";
import { setRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import type { VaultApi, VaultStatus } from "@/vault";
import { SecurityPanel } from "./SecurityPanel";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");
function api(
	status: Partial<VaultStatus>,
	over: Partial<VaultApi> = {},
): VaultApi {
	return {
		status: vi.fn(
			async () =>
				({
					state: "password",
					migrating: false,
					syncBound: false,
					brokenReason: null,
					...status,
				}) as VaultStatus,
		),
		setupKeychain: vi.fn(),
		setupPassword: vi.fn(),
		unlockKeychain: vi.fn(),
		unlockPassword: vi.fn(),
		unlockRecovery: vi.fn(),
		setPassword: vi.fn(async () => PHRASE),
		changePassword: vi.fn(async () => {}),
		removePassword: vi.fn(async () => {}),
		...over,
	};
}
const button = (name: RegExp) => screen.findByRole("button", { name });
const autoLock = () => screen.findByLabelText(/auto-lock|verrouillage auto/i);
const setSetting = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
	setSetting.mockClear();
	setRepository({ setSetting } as unknown as TodoRepository);
	useSettingsStore.setState({ autoLockMinutes: 0 });
});

describe("SecurityPanel", () => {
	it("offers only 'set a password' in keychain mode", async () => {
		render(<SecurityPanel api={api({ state: "keychain" })} />);
		expect(
			await button(/set a password|définir un mot de passe/i),
		).toBeEnabled();
		expect(
			screen.queryByRole("button", { name: /remove|supprimer/i }),
		).not.toBeInTheDocument();
	});

	it("sets a password, then shows the recovery key while blocking dismissal", async () => {
		const user = userEvent.setup();
		const a = api({ state: "keychain" });
		const blocked = vi.fn();
		render(<SecurityPanel api={a} onDismissBlockedChange={blocked} />);
		await user.click(await button(/set a password|définir un mot de passe/i));
		await user.type(
			screen.getByLabelText(/^new password$|^nouveau mot de passe$/i),
			"pw",
		);
		await user.type(screen.getByLabelText(/confirm/i), "pw");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(await screen.findByText("word24")).toBeInTheDocument();
		expect(a.setPassword).toHaveBeenCalledWith("pw");
		expect(blocked).toHaveBeenCalledWith(true);
	});

	it("changes and removes a local password", async () => {
		const user = userEvent.setup();
		const a = api({ state: "password" });
		render(<SecurityPanel api={a} />);
		await user.click(await button(/change password|changer le mot de passe/i));
		await user.type(screen.getByLabelText(/current|actuel/i), "old");
		await user.type(
			screen.getByLabelText(/^new password$|^nouveau mot de passe$/i),
			"new",
		);
		await user.type(screen.getByLabelText(/confirm/i), "new");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(a.changePassword).toHaveBeenCalledWith("old", "new");

		await user.click(
			await button(/remove password|supprimer le mot de passe/i),
		);
		await user.type(screen.getByLabelText(/current|actuel/i), "new");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(a.removePassword).toHaveBeenCalledWith("new");
	});

	it("reports a wrong current password", async () => {
		const user = userEvent.setup();
		const a = api(
			{ state: "password" },
			{
				removePassword: vi.fn(async () => {
					throw { code: "wrong-secret" };
				}),
			},
		);
		render(<SecurityPanel api={a} />);
		await user.click(
			await button(/remove password|supprimer le mot de passe/i),
		);
		await user.type(screen.getByLabelText(/current|actuel/i), "x");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(
			await screen.findByText(/did not work|n'a pas fonctionné/i),
		).toBeInTheDocument();
	});

	it("disables both actions on a synced device and says why", async () => {
		render(<SecurityPanel api={api({ state: "password", syncBound: true })} />);
		expect(
			await button(/change password|changer le mot de passe/i),
		).toBeDisabled();
		expect(
			screen.getByRole("button", {
				name: /remove password|supprimer le mot de passe/i,
			}),
		).toBeDisabled();
		expect(
			screen.getByText(/always asks|le demande toujours/i),
		).toBeInTheDocument();
	});

	async function fillSet(user: ReturnType<typeof userEvent.setup>) {
		await user.click(await button(/set a password|définir un mot de passe/i));
		await user.type(
			screen.getByLabelText(/^new password$|^nouveau mot de passe$/i),
			"pw",
		);
		await user.type(screen.getByLabelText(/confirm/i), "pw");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
	}

	it("drops the phrase and unblocks dismissal once it is confirmed", async () => {
		const user = userEvent.setup();
		const blocked = vi.fn();
		render(
			<SecurityPanel
				api={api({ state: "keychain" })}
				onDismissBlockedChange={blocked}
				random={() => 0}
			/>,
		);
		await fillSet(user);
		await screen.findByText("word24");
		await user.click(
			screen.getByRole("button", {
				name: /written them down|je les ai notés/i,
			}),
		);
		await user.type(screen.getByLabelText(/word 1|mot 1/i), "word1");
		await user.type(screen.getByLabelText(/word 2|mot 2/i), "word2");
		await user.type(screen.getByLabelText(/word 3|mot 3/i), "word3");
		await user.click(
			screen.getByRole("button", { name: /^confirm$|^confirmer$/i }),
		);
		expect(blocked).toHaveBeenLastCalledWith(false);
		expect(screen.queryByText("word24")).not.toBeInTheDocument();
	});

	it("keeps the phrase and shows no error when the status refresh fails after set", async () => {
		const user = userEvent.setup();
		const a = api({ state: "keychain" });
		vi.mocked(a.status)
			.mockResolvedValueOnce({
				state: "keychain",
				migrating: false,
				syncBound: false,
				brokenReason: null,
			} as VaultStatus)
			.mockRejectedValueOnce(new Error("boom"));
		render(<SecurityPanel api={a} />);
		await fillSet(user);
		expect(await screen.findByText("word24")).toBeInTheDocument();
		expect(screen.queryByText(/something went wrong|une erreur/i)).toBeNull();
	});

	it("rejects mismatched passwords without calling the API", async () => {
		const user = userEvent.setup();
		const a = api({ state: "keychain" });
		render(<SecurityPanel api={a} />);
		await user.click(await button(/set a password|définir un mot de passe/i));
		await user.type(
			screen.getByLabelText(/^new password$|^nouveau mot de passe$/i),
			"a",
		);
		await user.type(screen.getByLabelText(/confirm/i), "b");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(
			await screen.findByText(/do not match|ne correspondent pas/i),
		).toBeInTheDocument();
		expect(a.setPassword).not.toHaveBeenCalled();

		const c = api({ state: "password" });
		render(<SecurityPanel api={c} />);
		const changes = await screen.findAllByRole("button", {
			name: /change password|changer le mot de passe/i,
		});
		await user.click(changes[changes.length - 1]);
		await user.type(screen.getAllByLabelText(/current|actuel/i)[0], "old");
		await user.type(
			screen.getAllByLabelText(/^new password$|^nouveau mot de passe$/i)[1],
			"a",
		);
		await user.type(screen.getAllByLabelText(/confirm/i)[1], "b");
		await user.click(
			screen.getAllByRole("button", { name: /^save$|^enregistrer$/i })[1],
		);
		expect(c.changePassword).not.toHaveBeenCalled();
	});

	it("shows the mapped error when set or change fails", async () => {
		const user = userEvent.setup();
		const fail = async () => {
			throw { code: "wrong-secret" };
		};
		const a = api({ state: "keychain" }, { setPassword: vi.fn(fail) });
		const { unmount } = render(<SecurityPanel api={a} />);
		await fillSet(user);
		expect(
			await screen.findByText(/did not work|n'a pas fonctionné/i),
		).toBeInTheDocument();
		unmount();

		const b = api({ state: "password" }, { changePassword: vi.fn(fail) });
		render(<SecurityPanel api={b} />);
		await user.click(await button(/change password|changer le mot de passe/i));
		await user.type(screen.getByLabelText(/current|actuel/i), "old");
		await user.type(
			screen.getByLabelText(/^new password$|^nouveau mot de passe$/i),
			"n",
		);
		await user.type(screen.getByLabelText(/confirm/i), "n");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(
			await screen.findByText(/did not work|n'a pas fonctionné/i),
		).toBeInTheDocument();
	});

	it("shows an error with a retry when the initial status load fails", async () => {
		const user = userEvent.setup();
		const a = api({ state: "keychain" });
		vi.mocked(a.status).mockRejectedValueOnce({ code: "corrupt" });
		render(<SecurityPanel api={a} />);
		expect(await screen.findByText(/damaged|endommagé/i)).toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: /try again|réessayer/i }),
		);
		expect(
			await button(/set a password|définir un mot de passe/i),
		).toBeEnabled();
	});

	it("keeps Save disabled while a required field is empty", async () => {
		const user = userEvent.setup();
		render(<SecurityPanel api={api({ state: "password" })} />);
		await user.click(
			await button(/remove password|supprimer le mot de passe/i),
		);
		const save = screen.getByRole("button", { name: /^save$|^enregistrer$/i });
		expect(save).toBeDisabled();
		await user.type(screen.getByLabelText(/current|actuel/i), "x");
		expect(save).toBeEnabled();
	});

	it("confirms a successful change or removal", async () => {
		const user = userEvent.setup();
		render(<SecurityPanel api={api({ state: "password" })} />);
		await user.click(
			await button(/remove password|supprimer le mot de passe/i),
		);
		await user.type(screen.getByLabelText(/current|actuel/i), "x");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(
			await screen.findByText(/saved\.|enregistré\./i),
		).toBeInTheDocument();
	});

	it("says the key could not be saved when removing the password is refused by the keychain", async () => {
		const user = userEvent.setup();
		const a = api(
			{ state: "password" },
			{
				removePassword: vi.fn(async () => {
					throw { code: "keychain-denied" };
				}),
			},
		);
		render(<SecurityPanel api={a} />);
		await user.click(
			await button(/remove password|supprimer le mot de passe/i),
		);
		await user.type(screen.getByLabelText(/current|actuel/i), "pw");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		expect(
			await screen.findByText(
				/could not save its key|n'a pas pu enregistrer sa clé/i,
			),
		).toBeInTheDocument();
	});

	it("saves the chosen auto-lock delay", async () => {
		const user = userEvent.setup();
		render(<SecurityPanel api={api({ state: "password" })} />);
		await user.selectOptions(await autoLock(), "15");
		expect(setSetting).toHaveBeenCalledWith("auto_lock_minutes", "15");
		expect(useSettingsStore.getState().autoLockMinutes).toBe(15);
	});

	it("disables auto-lock in keychain mode", async () => {
		render(<SecurityPanel api={api({ state: "keychain" })} />);
		expect(await autoLock()).toBeDisabled();
	});

	it("turns auto-lock off when the password is removed", async () => {
		const user = userEvent.setup();
		useSettingsStore.setState({ autoLockMinutes: 5 });
		render(<SecurityPanel api={api({ state: "password" })} />);
		await user.click(
			await button(/remove password|supprimer le mot de passe/i),
		);
		await user.type(screen.getByLabelText(/current|actuel/i), "pw");
		await user.click(
			screen.getByRole("button", { name: /^save$|^enregistrer$/i }),
		);
		await waitFor(() =>
			expect(setSetting).toHaveBeenCalledWith("auto_lock_minutes", "0"),
		);
		expect(useSettingsStore.getState().autoLockMinutes).toBe(0);
	});
});
