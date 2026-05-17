import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { CalendarProjectFilter } from "@/components/calendar/CalendarProjectFilter";
import { useProjectStore } from "@/store/projects";

const mockProjects = [
	{
		id: "p1",
		name: "Dev",
		color: "#6ee7b7",
		icon: "folder",
		sortOrder: 0,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
	{
		id: "p2",
		name: "Perso",
		color: "#60a5fa",
		icon: "star",
		sortOrder: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];

beforeEach(() => {
	useProjectStore.setState({
		projects: mockProjects,
		loadProjects: vi.fn(),
		createProject: vi.fn(),
		updateProject: vi.fn(),
		deleteProject: vi.fn(),
	});
});

describe("CalendarProjectFilter", () => {
	it("trigger shows 'All projects' when value is undefined", () => {
		render(<CalendarProjectFilter value={undefined} onChange={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /project filter/i }),
		).toHaveTextContent("All projects");
	});

	it("trigger shows 'Inbox' when value is null", () => {
		render(<CalendarProjectFilter value={null} onChange={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /project filter/i }),
		).toHaveTextContent("Inbox");
	});

	it("trigger shows project name when a project is selected", () => {
		render(<CalendarProjectFilter value="p1" onChange={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /project filter/i }),
		).toHaveTextContent("Dev");
	});

	it("opens popover and lists all options on trigger click", async () => {
		const user = userEvent.setup();
		render(<CalendarProjectFilter value={undefined} onChange={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: /project filter/i }));
		expect(screen.getAllByText("All projects")).toHaveLength(2); // trigger + popover
		expect(screen.getAllByText("Inbox")).toHaveLength(1);
		expect(screen.getByText("Dev")).toBeInTheDocument();
		expect(screen.getByText("Perso")).toBeInTheDocument();
	});

	it("calls onChange(undefined) when 'All projects' is clicked in popover", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<CalendarProjectFilter value="p1" onChange={onChange} />);
		await user.click(screen.getByRole("button", { name: /project filter/i }));
		const allProjectsButtons = screen.getAllByText("All projects");
		await user.click(allProjectsButtons[allProjectsButtons.length - 1]);
		expect(onChange).toHaveBeenCalledWith(undefined);
	});

	it("calls onChange(null) when Inbox is clicked in popover", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<CalendarProjectFilter value={undefined} onChange={onChange} />);
		await user.click(screen.getByRole("button", { name: /project filter/i }));
		await user.click(screen.getByText("Inbox"));
		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("calls onChange with project id when a project is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<CalendarProjectFilter value={undefined} onChange={onChange} />);
		await user.click(screen.getByRole("button", { name: /project filter/i }));
		await user.click(screen.getByText("Dev"));
		expect(onChange).toHaveBeenCalledWith("p1");
	});

	it("trigger shows fallback label when value is a stale/unknown project id", () => {
		render(<CalendarProjectFilter value="nonexistent-id" onChange={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /project filter/i }),
		).toHaveTextContent("All projects");
	});

	it("shows checkmark next to active option", async () => {
		const user = userEvent.setup();
		render(<CalendarProjectFilter value={undefined} onChange={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: /project filter/i }));
		const allProjectsRow = screen
			.getAllByText("All projects")[1]
			.closest("button");
		expect(allProjectsRow).toHaveClass("bg-accent");
	});
});
