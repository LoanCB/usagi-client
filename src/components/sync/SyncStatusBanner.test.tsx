import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { useSyncStore } from "@/store/sync";
import type { SyncStatus } from "@/sync/types";
import { SyncStatusBanner } from "./SyncStatusBanner";

function setStatus(status: SyncStatus | null) {
	useSyncStore.setState({ status });
}

describe("SyncStatusBanner", () => {
	beforeEach(() => setStatus(null));

	it("ne rend rien quand la sync n'est pas configurée", () => {
		const { container } = render(<SyncStatusBanner onOpenSettings={vi.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it.each([
		"idle",
		"syncing",
		"awaiting-first-sync",
	] as const)("ne rend rien sur un statut sain (%s)", (status) => {
		setStatus(status);
		const { container } = render(<SyncStatusBanner onOpenSettings={vi.fn()} />);
		expect(container).toBeEmptyDOMElement();
	});

	it.each([
		["locked", /paused|en pause/i],
		["reauth-required", /sign in again|reconnexion/i],
		["protocol-mismatch", /not compatible|pas compatible/i],
	] as const)("annonce le statut %s", (status, pattern) => {
		setStatus(status);
		render(<SyncStatusBanner onOpenSettings={vi.fn()} />);
		expect(screen.getByText(pattern)).toBeInTheDocument();
	});

	it("ouvre les réglages depuis le bandeau", async () => {
		const user = userEvent.setup();
		const onOpenSettings = vi.fn();
		setStatus("locked");
		render(<SyncStatusBanner onOpenSettings={onOpenSettings} />);
		await user.click(
			screen.getByRole("button", {
				name: /open settings|ouvrir les réglages/i,
			}),
		);
		expect(onOpenSettings).toHaveBeenCalledTimes(1);
	});

	it("ouvre les réglages sur l'onglet Synchronisation, pas sur Général", async () => {
		const user = userEvent.setup();
		const onOpenSettings = vi.fn();
		setStatus("locked");
		render(<SyncStatusBanner onOpenSettings={onOpenSettings} />);
		await user.click(
			screen.getByRole("button", {
				name: /open settings|ouvrir les réglages/i,
			}),
		);
		// This banner is the only route to unlocking a locked vault; landing on
		// General leaves the user a click short of what the banner is about.
		expect(onOpenSettings).toHaveBeenCalledWith("sync");
	});
});
