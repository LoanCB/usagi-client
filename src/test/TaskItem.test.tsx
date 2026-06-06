import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { type MockInstance, vi } from "vitest";
import { TaskItem } from "@/components/tasks/TaskItem";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import type { Task } from "@/types";

let writeTextSpy: MockInstance;

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({})),
}));

vi.mock("@dnd-kit/sortable", () => ({
	useSortable: () => ({
		attributes: {},
		listeners: {},
		setNodeRef: vi.fn(),
		transform: null,
		transition: null,
		isDragging: false,
	}),
}));

const mockTask: Task = {
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
};

beforeEach(() => {
	vi.clearAllMocks();
	writeTextSpy = vi
		.spyOn(navigator.clipboard, "writeText")
		.mockResolvedValue(undefined);
	useTaskStore.setState({ allCount: 0, todayCount: 0 });
	useTagStore.setState({ tags: [] });
	useUIStore.setState({
		selectedTaskId: null,
		setSelectedTask: vi.fn(),
		sidebarCollapsed: false,
		setSidebarCollapsed: vi.fn(),
	});
});

afterEach(() => {
	writeTextSpy.mockRestore();
});

describe("TaskItem", () => {
	it("copies task title to clipboard when 'Copy title' is clicked", async () => {
		const user = userEvent.setup();
		render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

		await user.pointer({
			keys: "[MouseRight]",
			target: screen.getByText("Buy groceries"),
		});

		// Wait for the context menu to appear
		await screen.findByText("Copy title");

		// Spy after userEvent has installed its own clipboard stub, so our spy wins
		writeTextSpy = vi
			.spyOn(navigator.clipboard, "writeText")
			.mockResolvedValue(undefined);

		await user.pointer({
			keys: "[MouseLeft]",
			target: screen.getByText("Copy title"),
		});

		expect(writeTextSpy).toHaveBeenCalledWith("Buy groceries");
	});

	it("renders a priority dot for each priority level", () => {
		const { rerender } = render(
			<TaskItem
				task={{ ...mockTask, priority: "high" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("priority-dot")).toBeInTheDocument();

		rerender(
			<TaskItem
				task={{ ...mockTask, priority: "medium" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("priority-dot")).toBeInTheDocument();

		rerender(
			<TaskItem
				task={{ ...mockTask, priority: "low" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("priority-dot")).toBeInTheDocument();

		rerender(
			<TaskItem
				task={{ ...mockTask, priority: "none" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("priority-dot")).toBeInTheDocument();
	});

	it("applies red dot color for high priority", () => {
		render(
			<TaskItem
				task={{ ...mockTask, priority: "high" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		const dot = screen.getByTestId("priority-dot");
		expect(dot).toHaveStyle({ background: "#ef4444" });
		expect(dot).toHaveStyle({ boxShadow: "0 0 5px rgba(239,68,68,0.7)" });
	});

	it("applies yellow dot color for medium priority", () => {
		render(
			<TaskItem
				task={{ ...mockTask, priority: "medium" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("priority-dot")).toHaveStyle({
			background: "#eab308",
		});
	});

	it("applies green dot color for low priority", () => {
		render(
			<TaskItem
				task={{ ...mockTask, priority: "low" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("priority-dot")).toHaveStyle({
			background: "#22c55e",
		});
	});

	it("renders transparent dot for no priority", () => {
		render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);
		expect(screen.getByTestId("priority-dot")).toHaveStyle({
			background: "transparent",
		});
	});
});
