import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { DayDetailPanel } from "@/components/calendar/DayDetailPanel";
import * as repositoryModule from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
import type { Task } from "@/types";

// biome-ignore lint/suspicious/noExplicitAny: partial mock
const mockRepository = {} as any;
const mockCreateTask = vi.fn().mockResolvedValue({});

const noProjects: [] = [];

const base: Task = {
	id: "t1",
	title: "Design homepage",
	description: null,
	projectId: null,
	priority: "none",
	dueDate: "2026-05-17",
	completedAt: null,
	deletedAt: null,
	tags: [],
	sortOrder: 0,
	createdAt: "2026-05-01T10:00:00.000Z",
	updatedAt: "2026-05-01T10:00:00.000Z",
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(repositoryModule, "getRepository").mockReturnValue(mockRepository);
	useTaskStore.setState({
		tasks: [],
		loading: false,
		createTask: mockCreateTask,
		loadTasks: vi.fn(),
		updateTask: vi.fn(),
		completeTask: vi.fn(),
		uncompleteTask: vi.fn(),
		deleteTask: vi.fn(),
		reorderTasks: vi.fn(),
	});
});

describe("DayDetailPanel", () => {
	it("shows noTasks message when entry is undefined", () => {
		render(
			<DayDetailPanel
				day="2026-05-17"
				entry={undefined}
				width={280}
				onClose={vi.fn()}
				onTaskClick={vi.fn()}
				projects={noProjects}
			/>,
		);
		expect(screen.getByText(/no tasks for this day/i)).toBeInTheDocument();
	});

	it("renders due tasks", () => {
		render(
			<DayDetailPanel
				day="2026-05-17"
				entry={{ due: [base], completed: [] }}
				width={280}
				onClose={vi.fn()}
				onTaskClick={vi.fn()}
				projects={noProjects}
			/>,
		);
		expect(screen.getByText("Design homepage")).toBeInTheDocument();
	});

	it("renders completed tasks with line-through class", () => {
		const completed: Task = {
			...base,
			completedAt: "2026-05-17T10:00:00.000Z",
		};
		render(
			<DayDetailPanel
				day="2026-05-17"
				entry={{ due: [], completed: [completed] }}
				width={280}
				onClose={vi.fn()}
				onTaskClick={vi.fn()}
				projects={noProjects}
			/>,
		);
		expect(screen.getByText("Design homepage")).toHaveClass("line-through");
	});

	it("calls onTaskClick when a due task is clicked", async () => {
		const user = userEvent.setup();
		const onTaskClick = vi.fn();
		render(
			<DayDetailPanel
				day="2026-05-17"
				entry={{ due: [base], completed: [] }}
				width={280}
				onClose={vi.fn()}
				onTaskClick={onTaskClick}
				projects={noProjects}
			/>,
		);
		await user.click(screen.getByText("Design homepage"));
		expect(onTaskClick).toHaveBeenCalledWith(base);
	});

	it("calls onClose when the close button is clicked", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<DayDetailPanel
				day="2026-05-17"
				entry={undefined}
				width={280}
				onClose={onClose}
				onTaskClick={vi.fn()}
				projects={noProjects}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /close day detail/i }));
		expect(onClose).toHaveBeenCalledOnce();
	});
});
