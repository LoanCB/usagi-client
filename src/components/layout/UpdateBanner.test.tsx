import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { describe, expect, it, vi } from "vitest";
import type { UpdaterState } from "@/hooks/useUpdater";
import { UpdaterContext } from "@/hooks/useUpdater";
import { UpdateBanner } from "./UpdateBanner";

function makeState(overrides: Partial<UpdaterState> = {}): UpdaterState {
	return {
		status: "idle",
		available: null,
		progress: 0,
		error: null,
		checkForUpdate: vi.fn(),
		downloadAndInstall: vi.fn(),
		dismiss: vi.fn(),
		relaunchApp: vi.fn(),
		...overrides,
	};
}

function renderBanner(state: UpdaterState) {
	return render(
		<UpdaterContext.Provider value={state}>
			<UpdateBanner />
		</UpdaterContext.Provider>,
	);
}

describe("UpdateBanner", () => {
	it("renders nothing when status is idle", () => {
		const { container } = renderBanner(makeState());
		expect(container.firstChild).toBeNull();
	});

	it("shows version and buttons when a stable update is available", () => {
		renderBanner(
			makeState({
				status: "available",
				available: { version: "2.0.0", isBeta: false },
			}),
		);
		expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /later/i })).toBeInTheDocument();
	});

	it("shows the beta label and an install button (no GitHub link) for a beta update", () => {
		renderBanner(
			makeState({
				status: "available",
				available: { version: "2026.1.1-beta9", isBeta: true },
			}),
		);
		expect(screen.getByText(/beta/i)).toBeInTheDocument();
		expect(screen.getByText(/2026\.1\.1-beta9/)).toBeInTheDocument();
		// The "Mettre à jour" button installs natively; the old GitHub link is gone.
		expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: /github/i }),
		).not.toBeInTheDocument();
	});

	it("calls downloadAndInstall when update button clicked", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "available",
			available: { version: "2.0.0", isBeta: false },
		});
		renderBanner(state);
		await user.click(screen.getByRole("button", { name: /update/i }));
		expect(state.downloadAndInstall).toHaveBeenCalledOnce();
	});

	it("calls downloadAndInstall when installing a beta update", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "available",
			available: { version: "2026.1.1-beta9", isBeta: true },
		});
		renderBanner(state);
		await user.click(screen.getByRole("button", { name: /update/i }));
		expect(state.downloadAndInstall).toHaveBeenCalledOnce();
	});

	it("calls dismiss when plus tard clicked", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "available",
			available: { version: "2.0.0", isBeta: false },
		});
		renderBanner(state);
		await user.click(screen.getByRole("button", { name: /later/i }));
		expect(state.dismiss).toHaveBeenCalledOnce();
	});

	it("shows progress percentage during download", () => {
		renderBanner(
			makeState({
				status: "downloading",
				available: { version: "2.0.0", isBeta: false },
				progress: 67,
			}),
		);
		expect(screen.getByText("67%")).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"67",
		);
	});

	it("shows relaunch button when ready and calls relaunchApp on click", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "ready",
			available: { version: "2.0.0", isBeta: false },
			progress: 100,
		});
		renderBanner(state);
		const btn = screen.getByRole("button", { name: /restart/i });
		expect(btn).toBeInTheDocument();
		await user.click(btn);
		expect(state.relaunchApp).toHaveBeenCalledOnce();
	});

	it("shows retry button on error and calls checkForUpdate on click", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "error",
			available: { version: "2.0.0", isBeta: false },
		});
		renderBanner(state);
		await user.click(screen.getByRole("button", { name: /retry/i }));
		expect(state.checkForUpdate).toHaveBeenCalledOnce();
	});
});
