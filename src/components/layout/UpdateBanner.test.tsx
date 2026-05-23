import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Update } from "@tauri-apps/plugin-updater";
import { describe, expect, it, vi } from "vitest";
import type { UpdaterState } from "@/hooks/useUpdater";
import { UpdaterContext } from "@/hooks/useUpdater";
import { UpdateBanner } from "./UpdateBanner";

function makeState(overrides: Partial<UpdaterState> = {}): UpdaterState {
	return {
		status: "idle",
		update: null,
		progress: 0,
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

	it("shows version and buttons when update is available", () => {
		renderBanner(
			makeState({
				status: "available",
				update: { version: "2.0.0" } as unknown as Update,
			}),
		);
		expect(screen.getByText(/2\.0\.0/)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /mettre à jour/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /plus tard/i }),
		).toBeInTheDocument();
	});

	it("calls downloadAndInstall when update button clicked", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "available",
			update: { version: "2.0.0" } as unknown as Update,
		});
		renderBanner(state);
		await user.click(screen.getByRole("button", { name: /mettre à jour/i }));
		expect(state.downloadAndInstall).toHaveBeenCalledOnce();
	});

	it("calls dismiss when plus tard clicked", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "available",
			update: { version: "2.0.0" } as unknown as Update,
		});
		renderBanner(state);
		await user.click(screen.getByRole("button", { name: /plus tard/i }));
		expect(state.dismiss).toHaveBeenCalledOnce();
	});

	it("shows progress percentage during download", () => {
		renderBanner(
			makeState({
				status: "downloading",
				update: { version: "2.0.0" } as unknown as Update,
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
			update: { version: "2.0.0" } as unknown as Update,
			progress: 100,
		});
		renderBanner(state);
		const btn = screen.getByRole("button", { name: /redémarrer/i });
		expect(btn).toBeInTheDocument();
		await user.click(btn);
		expect(state.relaunchApp).toHaveBeenCalledOnce();
	});

	it("shows retry button on error and calls checkForUpdate on click", async () => {
		const user = userEvent.setup();
		const state = makeState({
			status: "error",
			update: { version: "2.0.0" } as unknown as Update,
		});
		renderBanner(state);
		await user.click(screen.getByRole("button", { name: /réessayer/i }));
		expect(state.checkForUpdate).toHaveBeenCalledOnce();
	});
});
