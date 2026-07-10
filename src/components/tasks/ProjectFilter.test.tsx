import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { ProjectFilter } from "@/components/tasks/ProjectFilter";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { useProjectStore } from "@/store/projects";

const mockProjects = [
	{
		id: "p1",
		name: "Dev",
		color: "#6ee7b7",
		icon: "folder",
		sortOrder: 0,
		groupId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
	{
		id: "p2",
		name: "Perso",
		color: "#60a5fa",
		icon: "star",
		sortOrder: 1,
		groupId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];

const trigger = () => screen.getByRole("button", { name: /project filter/i });

beforeEach(() => {
	useProjectStore.setState({
		projects: mockProjects,
		loadProjects: vi.fn(),
		createProject: vi.fn(),
		updateProject: vi.fn(),
		deleteProject: vi.fn(),
	});
});

describe("ProjectFilter", () => {
	it("trigger shows 'All projects' when value is null", () => {
		render(<ProjectFilter value={null} onChange={vi.fn()} />);
		expect(trigger()).toHaveTextContent("All projects");
	});

	it("trigger shows the project name when a single project is selected", () => {
		render(<ProjectFilter value={["p1"]} onChange={vi.fn()} />);
		expect(trigger()).toHaveTextContent("Dev");
	});

	it("trigger shows a count when several projects are selected", () => {
		render(<ProjectFilter value={["p1", "p2"]} onChange={vi.fn()} />);
		expect(trigger()).toHaveTextContent("2 projects");
	});

	it("opens popover and lists all options on trigger click", async () => {
		const user = userEvent.setup();
		render(<ProjectFilter value={null} onChange={vi.fn()} />);
		await user.click(trigger());
		expect(screen.getAllByText("All projects")).toHaveLength(2); // trigger + popover
		expect(screen.getByText("Inbox")).toBeInTheDocument();
		expect(screen.getByText("Dev")).toBeInTheDocument();
		expect(screen.getByText("Perso")).toBeInTheDocument();
	});

	it("adds a project to the selection when clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={null} onChange={onChange} />);
		await user.click(trigger());
		await user.click(screen.getByText("Dev"));
		expect(onChange).toHaveBeenCalledWith(["p1"]);
	});

	it("toggles Inbox using the INBOX sentinel", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={null} onChange={onChange} />);
		await user.click(trigger());
		await user.click(screen.getByText("Inbox"));
		expect(onChange).toHaveBeenCalledWith([INBOX_PROJECT_ID]);
	});

	it("appends to an existing selection", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={["p1"]} onChange={onChange} />);
		await user.click(trigger());
		await user.click(screen.getByText("Perso"));
		expect(onChange).toHaveBeenCalledWith(["p1", "p2"]);
	});

	it("collapses to null (all) when the last selected project is removed", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={["p1"]} onChange={onChange} />);
		await user.click(trigger());
		// "Dev" is in both the trigger and the popover row — target the row.
		await user.click(screen.getAllByText("Dev").at(-1) as HTMLElement);
		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("calls onChange(null) when 'All projects' is clicked in the popover", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={["p1"]} onChange={onChange} />);
		await user.click(trigger());
		const allProjects = screen.getAllByText("All projects");
		await user.click(allProjects[allProjects.length - 1]);
		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("shows a checkmark next to selected options", async () => {
		const user = userEvent.setup();
		render(<ProjectFilter value={["p1"]} onChange={vi.fn()} />);
		await user.click(trigger());
		const devRow = (screen.getAllByText("Dev").at(-1) as HTMLElement).closest(
			"button",
		);
		expect(devRow).toHaveClass("bg-accent");
	});
});
