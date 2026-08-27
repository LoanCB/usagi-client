import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { FirstSyncDialog } from "./FirstSyncDialog";

function setup(
	overrides: Partial<React.ComponentProps<typeof FirstSyncDialog>> = {},
) {
	const props = {
		open: true,
		backup: vi.fn(async () => {}),
		resolve: vi.fn(async () => {}),
		onResolved: vi.fn(),
		...overrides,
	};
	render(<FirstSyncDialog {...props} />);
	return { props, user: userEvent.setup() };
}

const chooseMerge = () =>
	screen.getByRole("button", { name: /^merge$|^fusionner$/i });
const chooseReplace = () =>
	screen.getByRole("button", { name: /^replace$|^remplacer$/i });
const confirm = () =>
	screen.getByRole("button", { name: /^continue$|^continuer$/i });

describe("FirstSyncDialog", () => {
	it("n'applique rien tant que le choix n'est pas confirmé", async () => {
		const { props, user } = setup();
		await user.click(chooseMerge());
		expect(props.resolve).not.toHaveBeenCalled();
	});

	it("fusionne sans écrire de sauvegarde", async () => {
		const { props, user } = setup();
		await user.click(chooseMerge());
		await user.click(confirm());
		await waitFor(() => expect(props.resolve).toHaveBeenCalledWith("merge"));
		expect(props.backup).not.toHaveBeenCalled();
		expect(props.onResolved).toHaveBeenCalledTimes(1);
	});

	it("écrit la sauvegarde AVANT de remplacer", async () => {
		const order: string[] = [];
		const { props, user } = setup({
			backup: vi.fn(async () => {
				order.push("backup");
			}),
			resolve: vi.fn(async () => {
				order.push("resolve");
			}),
		});
		await user.click(chooseReplace());
		await user.click(confirm());
		await waitFor(() => expect(props.resolve).toHaveBeenCalledWith("replace"));
		expect(order).toEqual(["backup", "resolve"]);
	});

	it("n'efface RIEN si la sauvegarde échoue", async () => {
		const { props, user } = setup({
			backup: vi.fn(async () => {
				throw new Error("disk full");
			}),
		});
		await user.click(chooseReplace());
		await user.click(confirm());
		expect(
			await screen.findByText(
				/backup could not be saved|sauvegarde n'a pas pu/i,
			),
		).toBeInTheDocument();
		expect(props.resolve).not.toHaveBeenCalled();
		expect(props.onResolved).not.toHaveBeenCalled();
	});

	it("avertit explicitement de la destruction avant de remplacer", async () => {
		const { user } = setup();
		await user.click(chooseReplace());
		expect(
			screen.getByText(/will be deleted|seront supprimés/i),
		).toBeInTheDocument();
		expect(
			screen.getByText(/backup is saved|sauvegarde est enregistrée/i),
		).toBeInTheDocument();
	});

	it("signale un échec d'application sans prétendre avoir réussi", async () => {
		const { props, user } = setup({
			resolve: vi.fn(async () => {
				throw new Error("engine failed");
			}),
		});
		await user.click(chooseMerge());
		await user.click(confirm());
		expect(
			await screen.findByText(/could not apply|impossible d'appliquer/i),
		).toBeInTheDocument();
		expect(props.onResolved).not.toHaveBeenCalled();
	});

	it("efface l'erreur de sauvegarde quand l'utilisateur change d'avis pour Fusionner", async () => {
		const { props, user } = setup({
			backup: vi.fn(async () => {
				throw new Error("disk full");
			}),
		});
		await user.click(chooseReplace());
		await user.click(confirm());
		expect(
			await screen.findByText(
				/backup could not be saved|sauvegarde n'a pas pu/i,
			),
		).toBeInTheDocument();

		// Merge never backs up, so a lingering backup error would be nonsense.
		await user.click(chooseMerge());
		expect(
			screen.queryByText(/backup could not be saved|sauvegarde n'a pas pu/i),
		).not.toBeInTheDocument();
		expect(props.resolve).not.toHaveBeenCalled();
	});

	it("efface l'erreur d'application quand l'utilisateur change d'avis", async () => {
		const { user } = setup({
			resolve: vi.fn(async () => {
				throw new Error("engine failed");
			}),
		});
		await user.click(chooseMerge());
		await user.click(confirm());
		expect(
			await screen.findByText(/could not apply|impossible d'appliquer/i),
		).toBeInTheDocument();

		// Changing the choice is a fresh attempt: the previous failure no longer
		// describes what would happen on confirm.
		await user.click(chooseReplace());
		expect(
			screen.queryByText(/could not apply|impossible d'appliquer/i),
		).not.toBeInTheDocument();
	});

	it("ne peut pas être fermé sans répondre", () => {
		setup();
		// §6.4: le moteur reste suspendu tant que la question n'a pas de réponse,
		// donc pas de bouton Annuler.
		expect(
			screen.queryByRole("button", { name: /cancel|annuler/i }),
		).not.toBeInTheDocument();
	});
});
