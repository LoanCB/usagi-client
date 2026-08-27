import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import type { SyncDevice } from "@/sync/devices-types";
import { DeviceList } from "./DeviceList";

const CURRENT: SyncDevice = {
	id: "11111111-1111-4111-8111-111111111111",
	name: "Poste fixe",
	platform: "linux",
	lastSeenAt: "2026-08-26T09:00:00.000Z",
	createdAt: "2026-08-01T09:00:00.000Z",
	current: true,
};
const OTHER: SyncDevice = {
	id: "22222222-2222-4222-8222-222222222222",
	name: "Portable",
	platform: "macos",
	lastSeenAt: null,
	createdAt: "2026-08-02T09:00:00.000Z",
	current: false,
};

describe("DeviceList", () => {
	it("liste les appareils et marque l'appareil courant", async () => {
		render(
			<DeviceList
				load={vi.fn(async () => [CURRENT, OTHER])}
				revoke={vi.fn()}
			/>,
		);
		expect(await screen.findByText("Poste fixe")).toBeInTheDocument();
		expect(screen.getByText("Portable")).toBeInTheDocument();
		expect(screen.getByText(/this device|cet appareil/i)).toBeInTheDocument();
	});

	it("n'offre pas de révoquer l'appareil courant", async () => {
		render(
			<DeviceList
				load={vi.fn(async () => [CURRENT, OTHER])}
				revoke={vi.fn()}
			/>,
		);
		await screen.findByText("Poste fixe");
		// Un seul bouton Révoquer : celui de l'autre appareil.
		expect(
			screen.getAllByRole("button", { name: /revoke|révoquer/i }),
		).toHaveLength(1);
	});

	it("ne révoque qu'après confirmation, et recharge ensuite", async () => {
		const user = userEvent.setup();
		const revoke = vi.fn(async () => {});
		const load = vi.fn(async () => [CURRENT, OTHER]);
		render(<DeviceList load={load} revoke={revoke} />);
		await screen.findByText("Portable");

		await user.click(screen.getByRole("button", { name: /revoke|révoquer/i }));
		expect(revoke).not.toHaveBeenCalled();
		const dialog = screen.getByRole("alertdialog");
		expect(
			within(dialog).getByText(
				/revoke this device\?|révoquer cet appareil \?/i,
			),
		).toBeInTheDocument();

		// Scoped to the dialog: the row's "Revoke" button and the dialog's
		// confirm button share the same short label once the dialog is open.
		await user.click(
			within(dialog).getByRole("button", { name: /^revoke$|^révoquer$/i }),
		);
		await waitFor(() => expect(revoke).toHaveBeenCalledWith(OTHER.id));
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
	});

	it("signale un échec de chargement", async () => {
		render(
			<DeviceList
				load={vi.fn(async () => {
					throw new Error("500");
				})}
				revoke={vi.fn()}
			/>,
		);
		expect(
			await screen.findByText(/could not load|impossible de charger/i),
		).toBeInTheDocument();
	});

	it("signale un échec de révocation sans faire disparaître l'appareil", async () => {
		const user = userEvent.setup();
		render(
			<DeviceList
				load={vi.fn(async () => [CURRENT, OTHER])}
				revoke={vi.fn(async () => {
					throw new Error("404");
				})}
			/>,
		);
		await screen.findByText("Portable");
		await user.click(screen.getByRole("button", { name: /revoke|révoquer/i }));
		const dialog = screen.getByRole("alertdialog");
		await user.click(
			within(dialog).getByRole("button", { name: /^revoke$|^révoquer$/i }),
		);
		expect(
			await screen.findByText(/could not revoke|impossible de révoquer/i),
		).toBeInTheDocument();
		expect(screen.getByText("Portable")).toBeInTheDocument();
	});

	it("efface l'échec de révocation précédent en rouvrant le dialogue pour un autre appareil", async () => {
		const user = userEvent.setup();
		const revoke = vi.fn(async () => {
			throw new Error("404");
		});
		render(
			<DeviceList load={vi.fn(async () => [CURRENT, OTHER])} revoke={revoke} />,
		);
		await screen.findByText("Portable");

		// Trigger a failed revoke and leave the failure message on screen.
		await user.click(screen.getByRole("button", { name: /revoke|révoquer/i }));
		let dialog = screen.getByRole("alertdialog");
		await user.click(
			within(dialog).getByRole("button", { name: /^revoke$|^révoquer$/i }),
		);
		expect(
			await screen.findByText(/could not revoke|impossible de révoquer/i),
		).toBeInTheDocument();

		// Close without retrying, then reopen the same dialog.
		await user.click(screen.getByRole("button", { name: /cancel|annuler/i }));
		await user.click(screen.getByRole("button", { name: /revoke|révoquer/i }));
		dialog = screen.getByRole("alertdialog");
		expect(
			within(dialog).queryByText(/could not revoke|impossible de révoquer/i),
		).not.toBeInTheDocument();
	});
});
