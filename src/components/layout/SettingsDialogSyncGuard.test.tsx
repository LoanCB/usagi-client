import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import type { SyncPanelDeps } from "@/components/sync/SyncPanel";
import { useUIStore } from "@/store/ui";
import type { ServerInfo } from "@/sync/types";

const OPEN_SERVER: ServerInfo = {
	name: "usagi-server",
	version: "1.2.0",
	protocolVersion: 1,
	registrationEnabled: true,
	minClientVersion: "0.1.0",
};

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);

const deps: SyncPanelDeps = {
	loadSession: vi.fn(async () => null),
	probe: vi.fn(async () => OPEN_SERVER),
	signIn: vi.fn(async () => {}),
	register: vi.fn(async () => WORDS.join(" ")),
	signOut: vi.fn(async () => {}),
	unlock: vi.fn(async () => {}),
	syncNow: vi.fn(async () => {}),
	listDevices: vi.fn(async () => []),
	revokeDevice: vi.fn(async () => {}),
};

// The panel itself is exercised by SyncPanel.test.tsx; here only the host's
// dismissal guard is under test, so the production factory (which needs a Tauri
// runtime) is replaced by a fixed, stable dep object.
vi.mock("@/components/sync/sync-panel-deps", () => ({
	productionSyncDeps: () => deps,
}));

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({
		setSetting: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockResolvedValue({}),
	})),
}));

vi.mock("@/hooks/useUpdater", () => ({
	useUpdaterContext: () => ({ status: "idle", checkForUpdate: vi.fn() }),
	UpdaterContext: {
		Provider: ({ children }: { children: React.ReactNode }) => children,
	},
}));

vi.mock("@tauri-apps/api/app", () => ({
	getVersion: vi.fn().mockResolvedValue("1.0.0"),
}));

/** Renders the dialog the way Sidebar does: controlled from the UI store. */
function ControlledSettings() {
	const open = useUIStore((s) => s.settingsOpen);
	const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
	return (
		<SettingsDialog open={open} onOpenChange={setSettingsOpen}>
			<button type="button">Open</button>
		</SettingsDialog>
	);
}

/** Registers an account and stops on the screen showing the 24 words. */
async function reachRecoveryPhrase() {
	const user = userEvent.setup();
	useUIStore.getState().openSettings("sync");
	render(<ControlledSettings />);
	await user.type(
		await screen.findByLabelText(/server address|adresse du serveur/i),
		"https://sync.example.com",
	);
	await user.click(
		screen.getByRole("button", {
			name: /test connection|tester la connexion/i,
		}),
	);
	await user.click(
		screen.getByRole("button", { name: /^create account$|^créer un compte$/i }),
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
		screen.getByRole("button", { name: /^create account$|^créer un compte$/i }),
	);
	expect(await screen.findByText("word1")).toBeInTheDocument();
	return user;
}

beforeEach(() => {
	vi.clearAllMocks();
	useUIStore.setState({ settingsOpen: false, settingsTab: "general" });
});

describe("SettingsDialog — garde-fou de la clé de récupération", () => {
	it("s'ouvre directement sur l'onglet Synchronisation quand on le demande", async () => {
		useUIStore.getState().openSettings("sync");
		render(<ControlledSettings />);
		expect(
			await screen.findByLabelText(/server address|adresse du serveur/i),
		).toBeInTheDocument();
	});

	it("refuse de se refermer tant que la clé n'est pas confirmée", async () => {
		const user = await reachRecoveryPhrase();
		// The account already exists and the words are stored nowhere: Escape
		// would unmount the portal and destroy the only copy of them.
		await user.keyboard("{Escape}");
		expect(screen.getByText("word1")).toBeInTheDocument();
		expect(useUIStore.getState().settingsOpen).toBe(true);
	});

	it("retire la croix de fermeture pendant l'affichage de la clé", async () => {
		await reachRecoveryPhrase();
		expect(
			screen.queryByRole("button", { name: /close/i }),
		).not.toBeInTheDocument();
	});

	it("interdit de changer d'onglet pendant l'affichage de la clé", async () => {
		await reachRecoveryPhrase();
		// Leaving the Sync tab unmounts the panel, which destroys the phrase just
		// as surely as closing the dialog.
		for (const tab of screen.getAllByRole("tab")) {
			expect(tab).toBeDisabled();
		}
	});

	it("laisse de nouveau se refermer une fois la clé confirmée", async () => {
		const user = await reachRecoveryPhrase();
		await user.click(
			screen.getByRole("button", {
				name: /i have written them down|je les ai notés/i,
			}),
		);
		for (const input of screen.getAllByLabelText(/word \d+|mot \d+/i)) {
			const position = Number(input.getAttribute("id")?.split("-").pop());
			await user.type(input, WORDS[position - 1]);
		}
		await user.click(
			screen.getByRole("button", { name: /^confirm$|^confirmer$/i }),
		);
		await user.keyboard("{Escape}");
		expect(useUIStore.getState().settingsOpen).toBe(false);
	});
});
