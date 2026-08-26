import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { SyncUnlockOfflineError } from "@/sync/types";
import { UnlockDialog } from "./UnlockDialog";

const password = () => screen.getByLabelText(/password|mot de passe/i);
const submit = () =>
	screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i });

describe("UnlockDialog", () => {
	it("n'active le bouton qu'avec un mot de passe saisi", async () => {
		const user = userEvent.setup();
		render(<UnlockDialog open onOpenChange={vi.fn()} onUnlock={vi.fn()} />);
		expect(submit()).toBeDisabled();
		await user.type(password(), "hunter2");
		expect(submit()).toBeEnabled();
	});

	it("transmet le mot de passe et referme au succès", async () => {
		const user = userEvent.setup();
		const onUnlock = vi.fn(async () => {});
		const onOpenChange = vi.fn();
		render(
			<UnlockDialog open onOpenChange={onOpenChange} onUnlock={onUnlock} />,
		);
		await user.type(password(), "hunter2");
		await user.click(submit());
		expect(onUnlock).toHaveBeenCalledWith("hunter2");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("signale un mot de passe erroné sans refermer", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<UnlockDialog
				open
				onOpenChange={onOpenChange}
				onUnlock={vi.fn(async () => {
					throw new Error("bad password");
				})}
			/>,
		);
		await user.type(password(), "wrong");
		await user.click(submit());
		expect(
			await screen.findByText(/wrong password|mot de passe incorrect/i),
		).toBeInTheDocument();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("signale une panne réseau honnêtement, sans accuser le mot de passe", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<UnlockDialog
				open
				onOpenChange={onOpenChange}
				onUnlock={vi.fn(async () => {
					throw new SyncUnlockOfflineError();
				})}
			/>,
		);
		await user.type(password(), "hunter2hunter2");
		await user.click(submit());
		expect(
			await screen.findByText(
				/can't reach the server|impossible de joindre le serveur/i,
			),
		).toBeInTheDocument();
		expect(
			screen.queryByText(/^wrong password\.$|^mot de passe incorrect\.$/i),
		).not.toBeInTheDocument();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("n'expose jamais le mot de passe en clair", async () => {
		render(<UnlockDialog open onOpenChange={vi.fn()} onUnlock={vi.fn()} />);
		expect(password()).toHaveAttribute("type", "password");
	});

	it("oublie le mot de passe saisi après un déverrouillage réussi", async () => {
		const user = userEvent.setup();
		render(
			<UnlockDialog
				open
				onOpenChange={vi.fn()}
				onUnlock={vi.fn(async () => {})}
			/>,
		);
		await user.type(password(), "hunter2");
		await user.click(submit());
		expect(password()).toHaveValue("");
	});

	it("efface l'erreur et le mot de passe saisi quand le dialogue se referme puis se rouvre", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const { rerender } = render(
			<UnlockDialog
				open
				onOpenChange={onOpenChange}
				onUnlock={vi.fn(async () => {
					throw new Error("bad password");
				})}
			/>,
		);
		await user.type(password(), "wrong");
		await user.click(submit());
		expect(
			await screen.findByText(/wrong password|mot de passe incorrect/i),
		).toBeInTheDocument();

		// User closes the dialog (e.g. cancel / escape) after the failure.
		rerender(
			<UnlockDialog
				open={false}
				onOpenChange={onOpenChange}
				onUnlock={vi.fn(async () => {})}
			/>,
		);
		// Reopen: stale error and stale password must be gone.
		rerender(
			<UnlockDialog
				open
				onOpenChange={onOpenChange}
				onUnlock={vi.fn(async () => {})}
			/>,
		);
		expect(
			screen.queryByText(/wrong password|mot de passe incorrect/i),
		).not.toBeInTheDocument();
		expect(password()).toHaveValue("");
	});
});
