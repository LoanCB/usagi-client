import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { vi } from "vitest";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { useProjectStore } from "@/store/projects";
import { useSearchStore } from "@/store/search";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";

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
		expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument();
	});

	it("renders nothing when closed", () => {
		useSearchStore.setState({ isOpen: false });
		render(<GlobalSearch />);
		expect(
			screen.queryByPlaceholderText(/search tasks/i),
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

		await user.type(screen.getByPlaceholderText(/search tasks/i), "grocer");
		expect(await screen.findByText("Buy groceries")).toBeInTheDocument();
	});

	it("does not show a task that does not match", async () => {
		useTaskStore.setState((s) => ({
			...s,
			tasks: [makeTask({ title: "Buy groceries" })],
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/search tasks/i), "xyz");
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

		await user.type(screen.getByPlaceholderText(/search tasks/i), "archived");
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

		await user.type(screen.getByPlaceholderText(/search tasks/i), "grocer");
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
					groupId: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		}));
		const user = userEvent.setup();
		render(<GlobalSearch />);

		await user.type(screen.getByPlaceholderText(/search tasks/i), "my project");
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

		await user.type(screen.getByPlaceholderText(/search tasks/i), "urgent");
		await user.click(await screen.findByText("urgent"));

		expect(mockSetSelectedProject).toHaveBeenCalledWith("tags");
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
		await user.type(screen.getByPlaceholderText(/search tasks/i), "buy");
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
