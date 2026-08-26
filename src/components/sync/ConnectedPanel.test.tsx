import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { ConnectedPanel } from "./ConnectedPanel";

function setup(
	overrides: Partial<React.ComponentProps<typeof ConnectedPanel>> = {},
) {
	const props = {
		accountEmail: "a@example.com",
		serverUrl: "https://sync.example.com",
		status: "idle" as const,
		lastSyncAt: "2026-08-26T09:00:00.000Z",
		onSyncNow: vi.fn(async () => {}),
		onDisconnect: vi.fn(async () => {}),
		onUnlock: vi.fn(),
		devices: { load: vi.fn(async () => []), revoke: vi.fn(async () => {}) },
		...overrides,
	};
	render(<ConnectedPanel {...props} />);
	return { props, user: userEvent.setup() };
}

describe("ConnectedPanel", () => {
	it("montre le compte, le serveur et l'état", () => {
		setup();
		expect(screen.getByText("a@example.com")).toBeInTheDocument();
		expect(screen.getByText("https://sync.example.com")).toBeInTheDocument();
		expect(screen.getByText(/up to date|à jour/i)).toBeInTheDocument();
	});

	it("indique « jamais » quand aucune sync n'a eu lieu", () => {
		setup({ lastSyncAt: null });
		expect(screen.getByText(/^never$|^jamais$/i)).toBeInTheDocument();
	});

	it("déclenche une synchronisation manuelle", async () => {
		const { props, user } = setup();
		await user.click(
			screen.getByRole("button", { name: /sync now|synchroniser maintenant/i }),
		);
		expect(props.onSyncNow).toHaveBeenCalledTimes(1);
	});

	it("propose de déverrouiller, et pas de synchroniser, quand le coffre est fermé", async () => {
		const { props, user } = setup({ status: "locked" });
		expect(screen.getByText(/paused|en pause/i)).toBeInTheDocument();
		await user.click(
			screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i }),
		);
		expect(props.onUnlock).toHaveBeenCalledTimes(1);
		expect(
			screen.queryByRole("button", {
				name: /sync now|synchroniser maintenant/i,
			}),
		).not.toBeInTheDocument();
	});

	it("annonce la reconnexion nécessaire", () => {
		setup({ status: "reauth-required" });
		expect(screen.getByText(/sign in again|reconnexion/i)).toBeInTheDocument();
	});

	it("ne déconnecte qu'après confirmation", async () => {
		const { props, user } = setup();
		await user.click(
			screen.getByRole("button", {
				name: /disconnect this device|déconnecter cet appareil/i,
			}),
		);
		expect(props.onDisconnect).not.toHaveBeenCalled();
		const dialog = screen.getByRole("alertdialog");
		expect(
			within(dialog).getByText(
				/disconnect from this server\?|se déconnecter de ce serveur \?/i,
			),
		).toBeInTheDocument();

		// Scoped to the dialog: the opening button and the confirm button both
		// match the short label once the dialog is open.
		await user.click(
			within(dialog).getByRole("button", {
				name: /^disconnect$|^déconnecter$/i,
			}),
		);
		expect(props.onDisconnect).toHaveBeenCalledTimes(1);
	});

	it("rassure sur le sort des données locales avant de déconnecter", async () => {
		const { user } = setup();
		await user.click(
			screen.getByRole("button", {
				name: /disconnect this device|déconnecter cet appareil/i,
			}),
		);
		expect(
			screen.getByText(/stay on this device|restent sur cet appareil/i),
		).toBeInTheDocument();
	});
});
