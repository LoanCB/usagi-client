import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { QuickAddTask } from "@/components/tasks/QuickAddTask";
import * as repositoryModule from "@/store/repository";
import { useTaskStore } from "@/store/tasks";

// biome-ignore lint/suspicious/noExplicitAny: partial mock, full typing not needed in tests
const mockRepository = {} as any;
const mockCreateTask = vi.fn().mockResolvedValue({});

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

describe("QuickAddTask", () => {
	it("renders an input with the task title placeholder", () => {
		render(<QuickAddTask projectId={null} />);
		expect(screen.getByPlaceholderText(/task title/i)).toBeInTheDocument();
	});

	it("calls createTask with the typed title on Enter", async () => {
		const user = userEvent.setup();
		render(<QuickAddTask projectId={null} />);
		const input = screen.getByRole("textbox");
		await user.type(input, "Buy milk");
		await user.keyboard("{Enter}");
		expect(mockCreateTask).toHaveBeenCalledOnce();
		expect(mockCreateTask).toHaveBeenCalledWith(expect.anything(), {
			title: "Buy milk",
			projectId: null,
			tagIds: [],
		});
	});

	it("clears the input after Enter", async () => {
		const user = userEvent.setup();
		render(<QuickAddTask projectId={null} />);
		const input = screen.getByRole("textbox");
		await user.type(input, "Buy milk");
		await user.keyboard("{Enter}");
		expect(input).toHaveValue("");
	});

	it("does not call createTask when input is empty on Enter", async () => {
		const user = userEvent.setup();
		render(<QuickAddTask projectId={null} />);
		await user.keyboard("{Enter}");
		expect(mockCreateTask).not.toHaveBeenCalled();
	});

	it("clears the input on Escape without calling createTask", async () => {
		const user = userEvent.setup();
		render(<QuickAddTask projectId={null} />);
		const input = screen.getByRole("textbox");
		await user.type(input, "Some text");
		await user.keyboard("{Escape}");
		expect(input).toHaveValue("");
		expect(mockCreateTask).not.toHaveBeenCalled();
	});

	it("passes projectId to createTask", async () => {
		const user = userEvent.setup();
		render(<QuickAddTask projectId="proj-1" />);
		const input = screen.getByRole("textbox");
		await user.type(input, "New task");
		await user.keyboard("{Enter}");
		expect(mockCreateTask).toHaveBeenCalledWith(expect.anything(), {
			title: "New task",
			projectId: "proj-1",
			tagIds: [],
		});
	});

	it("keeps focus on the input after Enter", async () => {
		const user = userEvent.setup();
		render(<QuickAddTask projectId={null} />);
		const input = screen.getByRole("textbox");
		await user.type(input, "Buy milk");
		await user.keyboard("{Enter}");
		expect(input).toHaveFocus();
	});
});
