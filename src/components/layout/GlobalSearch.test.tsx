import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { vi } from "vitest";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { useArchiveStore } from "@/store/archives";
import { useProjectStore } from "@/store/projects";
import { useSearchStore } from "@/store/search";
import { useSettingsStore } from "@/store/settings";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Project, Task } from "@/types";

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({
		getArchivedTasks: vi.fn().mockResolvedValue([]),
	})),
}));

const mockNavigateToTask = vi.fn();
const mockSetSelectedProject = vi.fn();

const makeTask = (overrides: Partial<Task> = {}): Task => ({
	id: "task-1",
	title: "Buy groceries",
	description: null,
	projectId: null,
	priority: "none",
	dueDate: null,
	completedAt: null,
	deletedAt: null,
	tags: [],
	sortOrder: 0,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

beforeEach(() => {
	vi.clearAllMocks();
	useSearchStore.setState({ isOpen: true });
	useTaskStore.setState({
		tasks: [],
		archivedTasks: [],
		loading: false,
		allCount: 0,
		todayCount: 0,
		loadTasks: vi.fn(),
		loadArchivedTasks: vi.fn().mockResolvedValue(undefined),
		refreshCounts: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		completeTask: vi.fn().mockResolvedValue(undefined),
		uncompleteTask: vi.fn().mockResolvedValue(undefined),
		archiveTask: vi.fn().mockResolvedValue(undefined),
		deleteTask: vi.fn(),
		unarchiveTask: vi.fn(),
		moveTask: vi.fn(),
	});
	useArchiveStore.setState({ projects: [], groups: [], tasks: [] });
	useProjectStore.setState({
		projects: [],
		loadProjects: vi.fn(),
		createProject: vi.fn(),
		updateProject: vi.fn(),
		deleteProject: vi.fn(),
	});
	useTagStore.setState({
		tags: [],
		loadTags: vi.fn(),
		createTag: vi.fn(),
		updateTag: vi.fn(),
		deleteTag: vi.fn(),
	});
	useSettingsStore.setState({
		tagsVisible: true,
		calendarVisible: true,
		archivesVisible: true,
	});
	useUIStore.setState({
		sidebarCollapsed: false,
		selectedProjectId: undefined,
		selectedTaskId: null,
		activeFilters: {},
		setSidebarCollapsed: vi.fn(),
		setSelectedProject: mockSetSelectedProject,
		setSelectedTask: vi.fn(),
		navigateToTask: mockNavigateToTask,
		setFilters: vi.fn(),
	});
});

describe("GlobalSearch — visibility", () => {
	it("renders the input when open", () => {
		render(<GlobalSearch />);
		expect(screen.getByPlaceholderText(/^search views/i)).toBeInTheDocument();
	});

	it("renders nothing when closed", () => {
		useSearchStore.setState({ isOpen: false });
		render(<GlobalSearch />);
		expect(
			screen.queryByPlaceholderText(/^search views/i),
		).not.toBeInTheDocument();
	});
});

describe("GlobalSearch — task results", () => {
	it("shows a task that matches the query", async () => {
		useTaskStore.setState((s) => ({
			...s,
			tasks: [makeTask({ title: "Buy groceries" })],
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/^search views/i), "grocer");
		expect(await screen.findByText("Buy groceries")).toBeInTheDocument();
	});

	it("does not show a task that does not match", async () => {
		useTaskStore.setState((s) => ({
			...s,
			tasks: [makeTask({ title: "Buy groceries" })],
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/^search views/i), "xyz");
		expect(screen.queryByText("Buy groceries")).not.toBeInTheDocument();
	});

	it("includes archived tasks in results", async () => {
		useTaskStore.setState((s) => ({
			...s,
			archivedTasks: [
				makeTask({
					id: "a-1",
					title: "Old archived task",
					deletedAt: new Date().toISOString(),
				}),
			],
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/^search views/i), "archived");
		expect(await screen.findByText("Old archived task")).toBeInTheDocument();
	});
});

describe("GlobalSearch — navigation", () => {
	it("calls navigateToTask when a task result is clicked", async () => {
		const task = makeTask({
			id: "task-1",
			title: "Buy groceries",
			projectId: "proj-1",
		});
		useTaskStore.setState((s) => ({ ...s, tasks: [task] }));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/^search views/i), "grocer");
		await user.click(await screen.findByText("Buy groceries"));

		expect(mockNavigateToTask).toHaveBeenCalledWith("proj-1", "task-1");
	});

	it("calls setSelectedProject when a project result is clicked", async () => {
		useProjectStore.setState((s) => ({
			...s,
			projects: [
				{
					id: "proj-1",
					name: "My Project",
					color: null,
					icon: null,
					sortOrder: 0,
					sortKey: "a0",
					archivedAt: null,
					groupId: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(
			screen.getByPlaceholderText(/^search views/i),
			"my project",
		);
		await user.click(await screen.findByText("My Project"));

		expect(mockSetSelectedProject).toHaveBeenCalledWith("proj-1");
	});

	it("calls setSelectedProject('tags') when a tag result is clicked", async () => {
		useTagStore.setState((s) => ({
			...s,
			tags: [
				{
					id: "tag-1",
					name: "urgent",
					color: "#f59e0b",
					projectId: null,
				},
			],
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/^search views/i), "urgent");
		await user.click(await screen.findByText("urgent"));

		expect(mockSetSelectedProject).toHaveBeenCalledWith("tags");
	});
});

describe("GlobalSearch — views", () => {
	it("lists the views before anything is typed", () => {
		render(<GlobalSearch />);
		for (const name of ["Today", "All tasks", "Tags", "Calendar", "Archives"]) {
			expect(screen.getByRole("option", { name })).toBeInTheDocument();
		}
	});

	it("opens a view from the keyboard", async () => {
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/^search views/i), "calen");
		await user.keyboard("{Enter}");

		expect(mockSetSelectedProject).toHaveBeenCalledWith("calendar");
		expect(useSearchStore.getState().isOpen).toBe(false);
	});

	it("opens All tasks with its undefined selection", async () => {
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.click(screen.getByRole("option", { name: "All tasks" }));

		expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
	});

	it("hides views turned off in the settings", () => {
		useSettingsStore.setState({ calendarVisible: false });
		render(<GlobalSearch />);

		expect(
			screen.queryByRole("option", { name: "Calendar" }),
		).not.toBeInTheDocument();
	});
});

describe("GlobalSearch — quick actions", () => {
	it("calls completeTask when complete action is selected", async () => {
		const task = makeTask({ id: "task-1", title: "Buy groceries" });
		const mockCompleteTask = vi.fn().mockResolvedValue(undefined);
		useTaskStore.setState((s) => ({
			...s,
			tasks: [task],
			completeTask: mockCompleteTask,
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		// Type to show results
		await user.type(screen.getByPlaceholderText(/^search views/i), "buy");
		// Arrow down to select the task
		await user.keyboard("{ArrowDown}");
		// Tab to enter quick actions
		await user.keyboard("{Tab}");
		// Task title should appear in input area
		expect(await screen.findByText("Buy groceries")).toBeInTheDocument();
		// Click complete action
		await user.click(screen.getByText(/mark as complete/i));

		expect(mockCompleteTask).toHaveBeenCalledWith(expect.anything(), "task-1");
	});
});

describe("GlobalSearch — archived projects", () => {
	const archivedProject: Project = {
		id: "p-old",
		name: "Dormant",
		color: null,
		icon: null,
		sortOrder: 0,
		sortKey: "a0",
		groupId: null,
		archivedAt: "2026-10-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};

	it("finds an archived project and opens it", async () => {
		useArchiveStore.setState({ projects: [archivedProject] });
		render(<GlobalSearch />);

		await userEvent.type(screen.getByRole("combobox"), "dorm");
		expect(screen.getByText("archived")).toBeInTheDocument();
		await userEvent.click(screen.getByText("Dormant"));

		expect(mockSetSelectedProject).toHaveBeenCalledWith("p-old");
	});

	it("finds a task of an archived project, badged and opened in place", async () => {
		const task = makeTask({ id: "t-old", title: "Buried", projectId: "p-old" });
		useArchiveStore.setState({ projects: [archivedProject], tasks: [task] });
		render(<GlobalSearch />);

		await userEvent.type(screen.getByRole("combobox"), "buried");
		expect(screen.getByText("archived")).toBeInTheDocument();
		await userEvent.click(screen.getByText("Buried"));

		expect(mockNavigateToTask).toHaveBeenCalledWith("p-old", "t-old");
	});

	it("offers no quick action on such a task", async () => {
		const task = makeTask({ id: "t-old", title: "Buried", projectId: "p-old" });
		useArchiveStore.setState({ projects: [archivedProject], tasks: [task] });
		render(<GlobalSearch />);

		await userEvent.type(screen.getByRole("combobox"), "buried");
		await userEvent.keyboard("{Tab}");

		expect(screen.queryByText("Archive task")).not.toBeInTheDocument();
	});

	it("lists a task once while its archived project is open", async () => {
		const task = makeTask({ id: "t-old", title: "Buried", projectId: "p-old" });
		useTaskStore.setState((s) => ({ ...s, tasks: [task] }));
		useArchiveStore.setState({ projects: [archivedProject], tasks: [task] });
		render(<GlobalSearch />);

		await userEvent.type(screen.getByRole("combobox"), "buried");

		expect(screen.getAllByText("Buried")).toHaveLength(1);
	});
});
