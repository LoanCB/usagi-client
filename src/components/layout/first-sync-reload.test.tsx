import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository } from "@/store/repository";
import { useSyncStore } from "@/store/sync";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";

const repo = { marker: "repository" };

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => repo),
	setRepository: vi.fn(),
}));

const resolveFirstSync = vi.fn(async () => {});

vi.mock("@/sync/runtime", () => ({
	getSyncRuntime: () => ({ engine: { resolveFirstSync } }),
}));

// AppShell's chrome is irrelevant here and drags in the whole app; stub it so
// the only live pieces are the first-sync dialog and the wiring under test.
vi.mock("./Sidebar", () => ({ Sidebar: () => null }));
vi.mock("./TaskList", () => ({ TaskList: () => null }));
vi.mock("./TaskDetail", () => ({ TaskDetail: () => null }));
vi.mock("./GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("./ResizeHandle", () => ({ ResizeHandle: () => null }));
vi.mock("@/components/calendar/CalendarView", () => ({
	CalendarView: () => null,
}));
vi.mock("@/components/layout/ArchiveView", () => ({ ArchiveView: () => null }));
vi.mock("@/components/tags/TagManager", () => ({ TagManager: () => null }));
vi.mock("@tauri-apps/api/path", () => ({
	appConfigDir: vi.fn(async () => "/config"),
	join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));

const { AppShell } = await import("./AppShell");
const { reloadStoresAfterFirstSync } = await import("./first-sync-reload");

const loadTasks = vi.fn(async () => {});
const loadProjects = vi.fn(async () => {});
const loadGroups = vi.fn(async () => {});
const loadTags = vi.fn(async () => {});

beforeEach(() => {
	vi.clearAllMocks();
	useTaskStore.setState({ loadTasks });
	useProjectStore.setState({ loadProjects });
	useProjectGroupStore.setState({ loadGroups });
	useTagStore.setState({ loadTags });
});

describe("reloadStoresAfterFirstSync", () => {
	it("recharge les quatre magasins depuis le dépôt courant", () => {
		// resolveFirstSync deletes and re-pulls through db.transaction, bypassing
		// the repository: nothing else invalidates these stores, so "Replace"
		// would keep rendering the tasks it just deleted.
		reloadStoresAfterFirstSync();
		expect(getRepository).toHaveBeenCalled();
		expect(loadProjects).toHaveBeenCalledWith(repo);
		expect(loadGroups).toHaveBeenCalledWith(repo);
		expect(loadTags).toHaveBeenCalledWith(repo);
		expect(loadTasks).toHaveBeenCalledWith(repo, {});
	});

	it("est réellement branché sur la résolution de la première synchronisation", async () => {
		const user = userEvent.setup();
		useSyncStore.setState({ status: "awaiting-first-sync" });
		render(<AppShell />);
		await user.click(
			screen.getByRole("button", { name: /^continue$|^continuer$/i }),
		);
		expect(resolveFirstSync).toHaveBeenCalledWith("merge");
		// onResolved was wired to `() => {}`, which compiled perfectly happily.
		expect(loadTasks).toHaveBeenCalledWith(repo, {});
	});
});
