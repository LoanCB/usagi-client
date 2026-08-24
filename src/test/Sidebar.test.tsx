import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { useProjectStore } from "@/store/projects";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { MemoryRepository } from "@/test-harness/MemoryRepository";
import type { Project } from "@/types";

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({
		setSetting: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockResolvedValue({}),
	})),
}));

vi.mock("@/hooks/useUpdater", () => ({
	useUpdaterContext: () => ({
		status: "idle",
		checkForUpdate: vi.fn(),
	}),
	UpdaterContext: {
		Provider: ({ children }: { children: React.ReactNode }) => children,
	},
}));

vi.mock("@tauri-apps/api/app", () => ({
	getVersion: vi.fn().mockResolvedValue("1.0.0"),
}));

const mockSetSelectedProject = vi.fn();

function setupStores({
	calendarVisible = true,
	archivesVisible = true,
	tagsVisible = true,
	selectedProjectId = undefined as string | undefined,
} = {}) {
	useProjectStore.setState({ projects: [] });
	useTaskStore.setState({ allCount: 0, todayCount: 0 });
	useSettingsStore.setState({ calendarVisible, archivesVisible, tagsVisible });
	useUIStore.setState({
		sidebarCollapsed: false,
		selectedProjectId,
		setSelectedProject: mockSetSelectedProject,
		setSidebarCollapsed: vi.fn(),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	setupStores();
});

describe("Sidebar — view visibility", () => {
	it("renders Calendar nav item when calendarVisible is true", () => {
		setupStores({ calendarVisible: true });
		render(<Sidebar />);
		expect(
			screen.getByRole("button", { name: /^(calendar|calendrier)$/i }),
		).toBeInTheDocument();
	});

	it("hides Calendar nav item when calendarVisible is false", () => {
		setupStores({ calendarVisible: false });
		render(<Sidebar />);
		expect(
			screen.queryByRole("button", { name: /^(calendar|calendrier)$/i }),
		).not.toBeInTheDocument();
	});

	it("hides Archives nav item when archivesVisible is false", () => {
		setupStores({ archivesVisible: false });
		render(<Sidebar />);
		expect(
			screen.queryByRole("button", { name: /^archives$/i }),
		).not.toBeInTheDocument();
	});

	it("hides Tags nav item when tagsVisible is false", () => {
		setupStores({ tagsVisible: false });
		render(<Sidebar />);
		expect(
			screen.queryByRole("button", { name: /^tags$/i }),
		).not.toBeInTheDocument();
	});
});

describe("Sidebar — redirect on active view hidden", () => {
	it("calls setSelectedProject(undefined) when active view is Calendar and calendarVisible becomes false", async () => {
		setupStores({ calendarVisible: true, selectedProjectId: "calendar" });
		render(<Sidebar />);

		await act(async () => {
			useSettingsStore.setState({ calendarVisible: false });
		});

		expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
		expect(mockSetSelectedProject).toHaveBeenCalledTimes(1);
	});

	it("calls setSelectedProject(undefined) when active view is Archives and archivesVisible becomes false", async () => {
		setupStores({ archivesVisible: true, selectedProjectId: "archives" });
		render(<Sidebar />);

		await act(async () => {
			useSettingsStore.setState({ archivesVisible: false });
		});

		expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
		expect(mockSetSelectedProject).toHaveBeenCalledTimes(1);
	});

	it("calls setSelectedProject(undefined) when active view is Tags and tagsVisible becomes false", async () => {
		setupStores({ tagsVisible: true, selectedProjectId: "tags" });
		render(<Sidebar />);

		await act(async () => {
			useSettingsStore.setState({ tagsVisible: false });
		});

		expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
		expect(mockSetSelectedProject).toHaveBeenCalledTimes(1);
	});

	it("does NOT redirect when active view is Today (always visible)", async () => {
		setupStores({ calendarVisible: false, selectedProjectId: "today" });
		render(<Sidebar />);
		expect(mockSetSelectedProject).not.toHaveBeenCalled();
	});
});

describe("Sidebar — rendered order", () => {
	// Every other ordering test in this repository asserts what the repository
	// returns. None asserted what the sidebar draws, which is how a memo that
	// re-sorted the repository's answer on the dead sortOrder column survived:
	// the drag wrote sort_key, the repository returned the new order, and the
	// component threw it away.
	function renderedProjectNames(container: HTMLElement): (string | null)[] {
		return Array.from(
			container.querySelectorAll<HTMLElement>("[data-dnd-item]"),
		).map(
			(el) => el.querySelector("button")?.getAttribute("aria-label") ?? null,
		);
	}

	it("draws projects in repository order after a move", async () => {
		const repo = new MemoryRepository();
		// Creation stamps sortOrder 1, 2, 3 and nothing ever updates it again, so
		// the move below makes the two orderings disagree on purpose.
		const alpha = await repo.createProject({ name: "Alpha" });
		await repo.createProject({ name: "Beta" });
		const gamma = await repo.createProject({ name: "Gamma" });

		await useProjectStore.getState().loadProjects(repo);
		await act(async () => {
			await useProjectStore
				.getState()
				.moveProject(repo, alpha.id, null, gamma.id);
		});

		// Repository order is Alpha, Gamma, Beta; sortOrder still says
		// Alpha, Beta, Gamma.
		expect((await repo.getProjects()).map((p) => p.name)).toEqual([
			"Alpha",
			"Gamma",
			"Beta",
		]);
		const { container } = render(<Sidebar />);
		expect(renderedProjectNames(container)).toEqual(["Alpha", "Gamma", "Beta"]);
	});
});

describe("ProjectNavItem — quick tag creation", () => {
	const mockProject: Project = {
		id: "proj-1",
		name: "Design",
		color: "#3b82f6",
		icon: null,
		sortOrder: 0,
		sortKey: "a0",
		groupId: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	const mockCreateTag = vi.fn().mockResolvedValue({
		id: "tag-1",
		name: "UI review",
		color: "#3b82f6",
		projectId: "proj-1",
	});

	beforeEach(() => {
		setupStores();
		useProjectStore.setState({ projects: [mockProject] });
		useTagStore.setState({
			tags: [],
			createTag: mockCreateTag,
			loadTags: vi.fn(),
			updateTag: vi.fn(),
			deleteTag: vi.fn(),
		});
	});

	it('shows "New tag" in the context menu when right-clicking a project', async () => {
		const user = userEvent.setup();
		render(<Sidebar />);

		await user.pointer({
			keys: "[MouseRight]",
			target: screen.getByText("Design"),
		});

		expect(await screen.findByText(/new tag/i)).toBeInTheDocument();
	});

	it("shows the tag name input when hovering the New tag submenu trigger", async () => {
		const user = userEvent.setup();
		render(<Sidebar />);

		await user.pointer({
			keys: "[MouseRight]",
			target: screen.getByText("Design"),
		});

		const newTagTrigger = await screen.findByText(/new tag/i);
		await user.hover(newTagTrigger);

		expect(await screen.findByPlaceholderText(/tag name/i)).toBeInTheDocument();
	});

	it("calls createTag with the correct projectId on Enter", async () => {
		const user = userEvent.setup();
		render(<Sidebar />);

		await user.pointer({
			keys: "[MouseRight]",
			target: screen.getByText("Design"),
		});

		const newTagTrigger = await screen.findByText(/new tag/i);
		await user.hover(newTagTrigger);

		const input = await screen.findByPlaceholderText(/tag name/i);
		fireEvent.change(input, { target: { value: "UI review" } });
		fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

		await waitFor(() => {
			expect(mockCreateTag).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					name: "UI review",
					projectId: "proj-1",
				}),
			);
		});
	});

	it("clears the name input after tag creation", async () => {
		const user = userEvent.setup();
		render(<Sidebar />);

		await user.pointer({
			keys: "[MouseRight]",
			target: screen.getByText("Design"),
		});

		const newTagTrigger = await screen.findByText(/new tag/i);
		await user.hover(newTagTrigger);

		const input = await screen.findByPlaceholderText(/tag name/i);
		fireEvent.change(input, { target: { value: "UI review" } });
		fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

		await waitFor(() => {
			expect(input).toHaveValue("");
		});
	});
});
