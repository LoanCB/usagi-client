import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { ImportConfirmDialog } from "@/components/layout/ImportConfirmDialog";
import type { ExportData } from "@/lib/dataTransfer";

const backup: ExportData = {
	version: 1,
	exportedAt: "2026-08-01T00:00:00.000Z",
	projects: [],
	tags: [],
	tasks: [],
};

function renderDialog(onConfirm = vi.fn(), onCancel = vi.fn()) {
	render(
		<ImportConfirmDialog
			data={backup}
			onConfirm={onConfirm}
			onCancel={onCancel}
		/>,
	);
	return { onConfirm, onCancel };
}

async function selectMode(
	user: ReturnType<typeof userEvent.setup>,
	mode: "merge" | "replace",
) {
	const name = mode === "merge" ? /merge|fusionner/i : /replace|remplacer/i;
	await user.click(screen.getByRole("button", { name }));
}

describe("ImportConfirmDialog", () => {
	it("does not import until the user confirms", async () => {
		const user = userEvent.setup();
		const { onConfirm } = renderDialog();
		await selectMode(user, "merge");
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("cancels without importing", async () => {
		const user = userEvent.setup();
		const { onConfirm, onCancel } = renderDialog();
		await user.click(screen.getByRole("button", { name: /cancel|annuler/i }));
		expect(onConfirm).not.toHaveBeenCalled();
		expect(onCancel).toHaveBeenCalledOnce();
	});

	it("imports once confirmed", async () => {
		const user = userEvent.setup();
		const { onConfirm } = renderDialog();
		await selectMode(user, "merge");
		await user.click(
			screen.getByRole("button", { name: /^import$|^importer$/i }),
		);
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onConfirm).toHaveBeenCalledWith("merge");
	});

	it("names the consequence for other devices in replace mode", async () => {
		const user = userEvent.setup();
		renderDialog();
		await selectMode(user, "replace");
		expect(screen.getByRole("alertdialog")).toHaveTextContent(
			/other .*devices|autres appareils/i,
		);
	});

	it("names the consequence for other devices in merge mode too", async () => {
		// A merge propagates like any other write: the spec's worked scenario is a
		// merge collision resurrecting a tombstone on another device.
		const user = userEvent.setup();
		renderDialog();
		await selectMode(user, "merge");
		expect(screen.getByRole("alertdialog")).toHaveTextContent(
			/other .*devices|autres appareils/i,
		);
	});

	it("does not claim merge deletes anything", async () => {
		// Deletion is the actual difference between the two modes — not whether
		// other devices are affected, which the copy used to imply.
		const user = userEvent.setup();
		renderDialog();
		await selectMode(user, "merge");
		expect(screen.getByRole("alertdialog")).not.toHaveTextContent(
			/delete|supprim/i,
		);
	});

	it("confirms with the replace strategy when replace is selected", async () => {
		const user = userEvent.setup();
		const { onConfirm } = renderDialog();
		await selectMode(user, "replace");
		await user.click(
			screen.getByRole("button", { name: /^import$|^importer$/i }),
		);
		expect(onConfirm).toHaveBeenCalledWith("replace");
	});
});
