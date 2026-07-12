import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { type MockInstance, vi } from "vitest";
import { TaskItem } from "@/components/tasks/TaskItem";
import { useSettingsStore } from "@/store/settings";
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
	useSettingsStore.setState({ colorblindMode: false });
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

	describe("inline title editing", () => {
		it("shows an input prefilled with the title on double-click", async () => {
			const user = userEvent.setup();
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

			await user.dblClick(screen.getByText("Buy groceries"));

			const input = screen.getByRole("textbox");
			expect(input).toHaveValue("Buy groceries");
		});

		it("saves the trimmed title on Enter", async () => {
			const user = userEvent.setup();
			const updateTask = vi.fn().mockResolvedValue(undefined);
			useTaskStore.setState({ updateTask });
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

			await user.dblClick(screen.getByText("Buy groceries"));
			const input = screen.getByRole("textbox");
			await user.clear(input);
			await user.type(input, "  Buy milk  {Enter}");

			expect(updateTask).toHaveBeenCalledWith(expect.anything(), "task-1", {
				title: "Buy milk",
			});
		});

		it("does not save and restores the title on Escape", async () => {
			const user = userEvent.setup();
			const updateTask = vi.fn().mockResolvedValue(undefined);
			useTaskStore.setState({ updateTask });
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

			await user.dblClick(screen.getByText("Buy groceries"));
			const input = screen.getByRole("textbox");
			await user.clear(input);
			await user.type(input, "Something else{Escape}");

			expect(updateTask).not.toHaveBeenCalled();
			expect(screen.getByText("Buy groceries")).toBeInTheDocument();
			expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		});

		it("does not save when the title is unchanged", async () => {
			const user = userEvent.setup();
			const updateTask = vi.fn().mockResolvedValue(undefined);
			useTaskStore.setState({ updateTask });
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

			await user.dblClick(screen.getByText("Buy groceries"));
			await user.type(screen.getByRole("textbox"), "{Enter}");

			expect(updateTask).not.toHaveBeenCalled();
		});

		it("still selects the task on single click", async () => {
			const user = userEvent.setup();
			const setSelectedTask = vi.fn();
			useUIStore.setState({ setSelectedTask });
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

			await user.click(screen.getByText("Buy groceries"));

			// Selection is deferred so a double-click can cancel it.
			await waitFor(() =>
				expect(setSelectedTask).toHaveBeenCalledWith("task-1"),
			);
		});

		it("enters edit mode from the 'Rename' context menu item", async () => {
			const user = userEvent.setup();
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

			await user.pointer({
				keys: "[MouseRight]",
				target: screen.getByText("Buy groceries"),
			});

			await user.pointer({
				keys: "[MouseLeft]",
				target: await screen.findByText("Rename"),
			});

			const input = screen.getByRole("textbox");
			expect(input).toHaveValue("Buy groceries");
		});

		it("does not open the detail (select) when double-clicking to edit", async () => {
			const user = userEvent.setup();
			const setSelectedTask = vi.fn();
			useUIStore.setState({ setSelectedTask });
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);

			await user.dblClick(screen.getByText("Buy groceries"));

			expect(setSelectedTask).not.toHaveBeenCalled();
			expect(screen.getByRole("textbox")).toBeInTheDocument();
		});
	});

	it.each([
		"lowest",
		"low",
		"medium",
		"high",
		"highest",
		"blocker",
	] as const)("renders a priority icon for %s priority", (priority) => {
		render(
			<TaskItem task={{ ...mockTask, priority }} onDeleteRequest={vi.fn()} />,
		);
		const indicator = screen.getByTestId("priority-indicator");
		expect(indicator.querySelector("svg")).toBeInTheDocument();
	});

	it("renders no icon for none priority", () => {
		render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);
		const indicator = screen.getByTestId("priority-indicator");
		expect(indicator.querySelector("svg")).not.toBeInTheDocument();
	});

	it.each([
		["highest", "#ef4444"],
		["medium", "#eab308"],
		["lowest", "#79b8ff"],
		["blocker", "#991b1b"],
	] as const)("colors the %s icon", (priority, color) => {
		render(
			<TaskItem task={{ ...mockTask, priority }} onDeleteRequest={vi.fn()} />,
		);
		const icon = screen.getByTestId("priority-indicator").querySelector("svg");
		expect(icon).toHaveStyle({ color });
	});

	it("shows the same icon in colorblind mode (shape carries meaning)", () => {
		useSettingsStore.setState({ colorblindMode: true });
		render(
			<TaskItem
				task={{ ...mockTask, priority: "highest" }}
				onDeleteRequest={vi.fn()}
			/>,
		);
		expect(
			screen.getByTestId("priority-indicator").querySelector("svg"),
		).toBeInTheDocument();
	});
});
