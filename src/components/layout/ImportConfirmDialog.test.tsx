import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { ImportConfirmDialog } from "@/components/layout/ImportConfirmDialog";
import type { ImportGaps } from "@/db/import-resolution";
import { NO_IMPORT_GAPS } from "@/db/import-resolution";
import type { ExportData } from "@/lib/dataTransfer";

const backup: ExportData = {
	version: 1,
	exportedAt: "2026-08-01T00:00:00.000Z",
	projects: [],
	tags: [],
	tasks: [],
};

type GapsByMode = Record<"merge" | "replace", ImportGaps>;

const NO_GAPS: GapsByMode = { merge: NO_IMPORT_GAPS, replace: NO_IMPORT_GAPS };

function renderDialog(
	onConfirm = vi.fn(),
	onCancel = vi.fn(),
	gaps: GapsByMode = NO_GAPS,
) {
	render(
		<ImportConfirmDialog
			data={backup}
			gaps={gaps}
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

	it("warns how many tasks a missing project sends to the Inbox", async () => {
		// The whole reason nulling project_id is acceptable rather than silent
		// data loss: the user is told the count before the transaction runs.
		const user = userEvent.setup();
		renderDialog(vi.fn(), vi.fn(), {
			merge: { ...NO_IMPORT_GAPS, inboxedTasks: 3 },
			replace: NO_IMPORT_GAPS,
		});
		await selectMode(user, "merge");
		expect(screen.getByRole("alertdialog")).toHaveTextContent(/3/);
		expect(screen.getByRole("alertdialog")).toHaveTextContent(
			/inbox|boîte de réception/i,
		);
	});

	it("says nothing about gaps when the payload resolves completely", async () => {
		const user = userEvent.setup();
		renderDialog();
		await selectMode(user, "merge");
		expect(screen.getByRole("alertdialog")).not.toHaveTextContent(
			/inbox|boîte de réception/i,
		);
	});

	it("re-reports the gaps for the mode the user actually picked", async () => {
		// A replace tombstones the projects the backup leaves out, so it can inbox
		// tasks a merge of the same file would leave alone.
		const user = userEvent.setup();
		renderDialog(vi.fn(), vi.fn(), {
			merge: NO_IMPORT_GAPS,
			replace: { ...NO_IMPORT_GAPS, inboxedTasks: 5 },
		});
		await selectMode(user, "merge");
		expect(screen.getByRole("alertdialog")).not.toHaveTextContent(
			/inbox|boîte de réception/i,
		);
		await selectMode(user, "replace");
		expect(screen.getByRole("alertdialog")).toHaveTextContent(/5/);
	});

	it("warns about tags losing their project scope", async () => {
		const user = userEvent.setup();
		renderDialog(vi.fn(), vi.fn(), {
			merge: { ...NO_IMPORT_GAPS, unscopedTags: 2 },
			replace: NO_IMPORT_GAPS,
		});
		await selectMode(user, "merge");
		expect(screen.getByRole("alertdialog")).toHaveTextContent(/2/);
	});

	it("warns about tag assignments it has to drop", async () => {
		const user = userEvent.setup();
		renderDialog(vi.fn(), vi.fn(), {
			merge: { ...NO_IMPORT_GAPS, droppedTagLinks: 4 },
			replace: NO_IMPORT_GAPS,
		});
		await selectMode(user, "merge");
		expect(screen.getByRole("alertdialog")).toHaveTextContent(/4/);
	});

	it("still lets the import through once the gaps are shown", async () => {
		// Refusing outright would dead-end a restore whose source device is gone,
		// which is the one moment a backup has to work.
		const user = userEvent.setup();
		const { onConfirm } = renderDialog(vi.fn(), vi.fn(), {
			merge: { ...NO_IMPORT_GAPS, inboxedTasks: 3 },
			replace: NO_IMPORT_GAPS,
		});
		await selectMode(user, "merge");
		await user.click(
			screen.getByRole("button", { name: /^import$|^importer$/i }),
		);
		expect(onConfirm).toHaveBeenCalledWith("merge");
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
