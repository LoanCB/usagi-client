import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { useSyncStore } from "@/store/sync";
import type { ServerInfo } from "@/sync/types";
import { SyncPanel, type SyncPanelDeps } from "./SyncPanel";

const OPEN_SERVER: ServerInfo = {
	name: "usagi-server",
	version: "1.2.0",
	protocolVersion: 1,
	registrationEnabled: true,
	minClientVersion: "0.1.0",
};
const CLOSED_SERVER: ServerInfo = {
	...OPEN_SERVER,
	registrationEnabled: false,
};

function makeDeps(overrides: Partial<SyncPanelDeps> = {}): SyncPanelDeps {
	return {
		loadSession: vi.fn(async () => null),
		probe: vi.fn(async () => OPEN_SERVER),
		signIn: vi.fn(async () => {}),
		register: vi.fn(async () => "w1 w2 w3"),
		signOut: vi.fn(async () => {}),
		unlock: vi.fn(async () => {}),
		syncNow: vi.fn(async () => {}),
		listDevices: vi.fn(async () => []),
		revokeDevice: vi.fn(async () => {}),
		...overrides,
	};
}

const testButton = () =>
	screen.getByRole("button", { name: /test connection|tester la connexion/i });

describe("SyncPanel", () => {
	beforeEach(() => {
		useSyncStore.setState({ status: null, lastSyncAt: null });
	});

	it("démarre sur la saisie d'URL quand aucun compte n'est connecté", async () => {
		render(<SyncPanel deps={makeDeps()} />);
		expect(
			await screen.findByLabelText(/server address|adresse du serveur/i),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText(/^password$|^mot de passe$/i),
		).not.toBeInTheDocument();
	});

	it("n'offre les identifiants qu'après un serveur vérifié", async () => {
		const user = userEvent.setup();
		render(<SyncPanel deps={makeDeps()} />);
		await user.type(
			await screen.findByLabelText(/server address|adresse du serveur/i),
			"https://sync.example.com",
		);
		await user.click(testButton());
		expect(
			await screen.findByLabelText(/^password$|^mot de passe$/i),
		).toBeInTheDocument();
	});

	it("cache la création de compte quand le serveur la refuse", async () => {
		const user = userEvent.setup();
		render(
			<SyncPanel
				deps={makeDeps({ probe: vi.fn(async () => CLOSED_SERVER) })}
			/>,
		);
		await user.type(
			await screen.findByLabelText(/server address|adresse du serveur/i),
			"https://sync.example.com",
		);
		await user.click(testButton());
		await screen.findByLabelText(/^password$|^mot de passe$/i);
		expect(
			screen.queryByRole("button", {
				name: /^create account$|^créer un compte$/i,
			}),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(
				/does not accept new accounts|n'accepte pas de nouveaux comptes/i,
			),
		).toBeInTheDocument();
	});

	it("connecte avec l'URL vérifiée et bascule sur le panneau connecté", async () => {
		const user = userEvent.setup();
		const deps = makeDeps();
		render(<SyncPanel deps={deps} />);
		await user.type(
			await screen.findByLabelText(/server address|adresse du serveur/i),
			"https://sync.example.com",
		);
		await user.click(testButton());
		await user.type(
			await screen.findByLabelText(/email|adresse e-mail/i),
			"a@example.com",
		);
		await user.type(
			screen.getByLabelText(/^password$|^mot de passe$/i),
			"hunter2hunter2",
		);
		await user.click(
			screen.getByRole("button", { name: /^sign in$|^se connecter$/i }),
		);

		await waitFor(() =>
			expect(deps.signIn).toHaveBeenCalledWith({
				serverUrl: "https://sync.example.com",
				email: "a@example.com",
				password: "hunter2hunter2",
			}),
		);
		expect(await screen.findByText("a@example.com")).toBeInTheDocument();
	});

	it("relit la session après inscription plutôt que d'afficher un email vide", async () => {
		const user = userEvent.setup();
		const words = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);
		const loadSession = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				accountEmail: "new@example.com",
				serverUrl: "https://sync.example.com",
			});
		const deps = makeDeps({
			loadSession,
			register: vi.fn(async () => words.join(" ")),
		});
		render(<SyncPanel deps={deps} />);
		await user.type(
			await screen.findByLabelText(/server address|adresse du serveur/i),
			"https://sync.example.com",
		);
		await user.click(testButton());
		await user.click(
			screen.getByRole("button", {
				name: /^create account$|^créer un compte$/i,
			}),
		);
		await user.type(
			await screen.findByLabelText(/email|adresse e-mail/i),
			"new@example.com",
		);
		await user.type(
			screen.getByLabelText(/^password$|^mot de passe$/i),
			"hunter2hunter2",
		);
		await user.click(
			screen.getByRole("button", {
				name: /^create account$|^créer un compte$/i,
			}),
		);
		await user.click(
			await screen.findByRole("button", {
				name: /i have written them down|je les ai notés/i,
			}),
		);
		// Fill whichever three word positions the confirmation step drew.
		for (const input of screen.getAllByLabelText(/word \d+|mot \d+/i)) {
			const position = Number(input.getAttribute("id")?.split("-").pop());
			await user.type(input, words[position - 1]);
		}
		await user.click(
			screen.getByRole("button", { name: /^confirm$|^confirmer$/i }),
		);
		expect(await screen.findByText("new@example.com")).toBeInTheDocument();
		expect(loadSession).toHaveBeenCalledTimes(2);
	});

	it("affiche directement le panneau connecté si une session existe", async () => {
		const deps = makeDeps({
			loadSession: vi.fn(async () => ({
				accountEmail: "b@example.com",
				serverUrl: "https://sync.example.com",
			})),
		});
		useSyncStore.setState({ status: "idle" });
		render(<SyncPanel deps={deps} />);
		expect(await screen.findByText("b@example.com")).toBeInTheDocument();
		expect(
			screen.queryByLabelText(/server address|adresse du serveur/i),
		).not.toBeInTheDocument();
	});

	it("revient à la saisie d'URL après déconnexion", async () => {
		const user = userEvent.setup();
		const deps = makeDeps({
			loadSession: vi.fn(async () => ({
				accountEmail: "b@example.com",
				serverUrl: "https://sync.example.com",
			})),
		});
		useSyncStore.setState({ status: "idle" });
		render(<SyncPanel deps={deps} />);
		await screen.findByText("b@example.com");
		await user.click(
			screen.getByRole("button", {
				name: /disconnect this device|déconnecter cet appareil/i,
			}),
		);
		await user.click(
			screen.getByRole("button", { name: /^disconnect$|^déconnecter$/i }),
		);
		expect(
			await screen.findByLabelText(/server address|adresse du serveur/i),
		).toBeInTheDocument();
		expect(deps.signOut).toHaveBeenCalledTimes(1);
	});
});
