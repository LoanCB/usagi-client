import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import type { ServerInfo } from "@/sync/types";
import { ServerUrlForm } from "./ServerUrlForm";

const OK: ServerInfo = {
	name: "usagi-server",
	version: "1.2.0",
	protocolVersion: 1,
	registrationEnabled: true,
	minClientVersion: "0.1.0",
};

function setup(
	overrides: Partial<React.ComponentProps<typeof ServerUrlForm>> = {},
) {
	const probe = overrides.probe ?? vi.fn(async () => OK);
	const onVerified = overrides.onVerified ?? vi.fn();
	render(
		<ServerUrlForm probe={probe} onVerified={onVerified} {...overrides} />,
	);
	return { probe, onVerified, user: userEvent.setup() };
}

const urlField = () =>
	screen.getByLabelText(/server address|adresse du serveur/i);
const testButton = () =>
	screen.getByRole("button", { name: /test connection|tester la connexion/i });

describe("ServerUrlForm", () => {
	it("ne sonde pas le réseau tant que l'URL est refusée", async () => {
		const { probe, user } = setup();
		await user.type(urlField(), "http://sync.example.com");
		await user.click(testButton());
		expect(probe).not.toHaveBeenCalled();
		expect(
			screen.getByText(
				/only allowed for localhost|autorisée que pour localhost/i,
			),
		).toBeInTheDocument();
	});

	it("normalise l'URL avant de sonder", async () => {
		const { probe, user } = setup();
		await user.type(urlField(), "sync.example.com/");
		await user.click(testButton());
		expect(probe).toHaveBeenCalledWith("https://sync.example.com");
	});

	it("annonce le serveur trouvé et remonte l'URL normalisée", async () => {
		const onVerified = vi.fn();
		const { user } = setup({ onVerified });
		await user.type(urlField(), "https://sync.example.com");
		await user.click(testButton());
		expect(await screen.findByText(/usagi-server 1\.2\.0/)).toBeInTheDocument();
		expect(onVerified).toHaveBeenCalledWith("https://sync.example.com", OK);
	});

	it("avertit sans bloquer sur un hôte local en http", async () => {
		const onVerified = vi.fn();
		const { probe, user } = setup({ onVerified });
		await user.type(urlField(), "http://localhost:3000");
		await user.click(testButton());
		expect(
			screen.getByText(/not encrypted|n'est pas chiffrée/i),
		).toBeInTheDocument();
		expect(probe).toHaveBeenCalledWith("http://localhost:3000");
		expect(onVerified).toHaveBeenCalled();
	});

	it("efface l'avertissement « non chiffrée » quand l'URL est modifiée après un test", async () => {
		const { user } = setup();
		await user.type(urlField(), "http://localhost:3000");
		await user.click(testButton());
		expect(
			screen.getByText(/not encrypted|n'est pas chiffrée/i),
		).toBeInTheDocument();

		// Editing to an https URL must not keep claiming the connection is plaintext.
		await user.clear(urlField());
		await user.type(urlField(), "https://sync.example.com");
		expect(
			screen.queryByText(/not encrypted|n'est pas chiffrée/i),
		).not.toBeInTheDocument();
	});

	it("distingue un serveur injoignable d'une réponse non-usagi", async () => {
		const { user } = setup({
			probe: vi.fn(async () => {
				throw new Error("offline");
			}),
		});
		await user.type(urlField(), "https://sync.example.com");
		await user.click(testButton());
		expect(
			await screen.findByText(/could not reach|impossible de joindre/i),
		).toBeInTheDocument();
	});

	it("refuse une réponse qui n'est pas un usagi-server", async () => {
		const onVerified = vi.fn();
		const { user } = setup({
			onVerified,
			probe: vi.fn(async () => ({ hello: "world" }) as unknown as ServerInfo),
		});
		await user.type(urlField(), "https://sync.example.com");
		await user.click(testButton());
		expect(
			await screen.findByText(/not a usagi server|pas un serveur usagi/i),
		).toBeInTheDocument();
		expect(onVerified).not.toHaveBeenCalled();
	});

	it("refuse un protocole incompatible en nommant les deux versions", async () => {
		const onVerified = vi.fn();
		const { user } = setup({
			onVerified,
			probe: vi.fn(async () => ({ ...OK, protocolVersion: 2 })),
		});
		await user.type(urlField(), "https://sync.example.com");
		await user.click(testButton());
		expect(
			await screen.findByText(/protocol version 2|version 2 du protocole/i),
		).toBeInTheDocument();
		expect(onVerified).not.toHaveBeenCalled();
	});

	it("verrouille la saisie et explique pourquoi quand disabled", () => {
		setup({ disabled: true, disabledHint: "Disconnect first" });
		expect(urlField()).toBeDisabled();
		expect(screen.getByText("Disconnect first")).toBeInTheDocument();
	});
});
