import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { ProjectFilter } from "@/components/tasks/ProjectFilter";
import { INBOX_PROJECT_ID } from "@/lib/dataTransfer";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";

const mockProjects = [
	{
		id: "p1",
		name: "Dev",
		color: "#6ee7b7",
		icon: "folder",
		sortOrder: 0,
		sortKey: "a1",
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
		sortKey: "a2",
		groupId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
	{
		id: "p3",
		name: "Site web",
		color: "#f472b6",
		icon: "folder",
		sortOrder: 2,
		sortKey: "a3",
		groupId: "g1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
	{
		id: "p4",
		name: "Campagne SEO",
		color: "#fbbf24",
		icon: "folder",
		sortOrder: 3,
		sortKey: "a4",
		groupId: "g1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];

const mockGroups = [
	{
		id: "g1",
		name: "Marketing",
		color: "#f59e0b",
		sortOrder: 0,
		sortKey: "a0",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];

const trigger = () => screen.getByRole("button", { name: /project filter/i });
const groupHeader = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
	useProjectStore.setState({
		projects: mockProjects,
		loadProjects: vi.fn(),
		createProject: vi.fn(),
		updateProject: vi.fn(),
		deleteProject: vi.fn(),
	});
	useProjectGroupStore.setState({ groups: mockGroups });
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
		const devRows = screen.getAllByText("Dev");
		await user.click(devRows[devRows.length - 1]);
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
		const devRows = screen.getAllByText("Dev");
		const devRow = devRows[devRows.length - 1].closest("button");
		expect(devRow).toHaveClass("bg-accent");
	});

	it("renders a group header alongside its member projects", async () => {
		const user = userEvent.setup();
		render(<ProjectFilter value={null} onChange={vi.fn()} />);
		await user.click(trigger());
		expect(groupHeader("Marketing")).toBeInTheDocument();
		expect(screen.getByText("Site web")).toBeInTheDocument();
		expect(screen.getByText("Campagne SEO")).toBeInTheDocument();
	});

	it("selects every member project when a group header is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={null} onChange={onChange} />);
		await user.click(trigger());
		await user.click(groupHeader("Marketing"));
		expect(onChange).toHaveBeenCalledWith(["p3", "p4"]);
	});

	it("appends group members to an existing selection without duplicates", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={["p1", "p3"]} onChange={onChange} />);
		await user.click(trigger());
		await user.click(groupHeader("Marketing"));
		expect(onChange).toHaveBeenCalledWith(["p1", "p3", "p4"]);
	});

	it("removes every member project when a fully-selected group is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ProjectFilter value={["p1", "p3", "p4"]} onChange={onChange} />);
		await user.click(trigger());
		await user.click(groupHeader("Marketing"));
		expect(onChange).toHaveBeenCalledWith(["p1"]);
	});

	it("marks the group header pressed when all members are selected", async () => {
		const user = userEvent.setup();
		render(<ProjectFilter value={["p3", "p4"]} onChange={vi.fn()} />);
		await user.click(trigger());
		expect(groupHeader("Marketing")).toHaveAttribute("aria-pressed", "true");
	});

	it("marks the group header mixed when only some members are selected", async () => {
		const user = userEvent.setup();
		render(<ProjectFilter value={["p3"]} onChange={vi.fn()} />);
		await user.click(trigger());
		expect(groupHeader("Marketing")).toHaveAttribute("aria-pressed", "mixed");
	});

	it("trigger shows the group name when exactly a full group is selected", () => {
		render(<ProjectFilter value={["p3", "p4"]} onChange={vi.fn()} />);
		expect(trigger()).toHaveTextContent("Marketing");
	});

	it("trigger falls back to a count when the selection is not exactly a group", () => {
		render(<ProjectFilter value={["p1", "p3", "p4"]} onChange={vi.fn()} />);
		expect(trigger()).toHaveTextContent("3 projects");
	});
});
