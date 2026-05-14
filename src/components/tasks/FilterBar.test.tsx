import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { FilterBar } from "@/components/tasks/FilterBar";
import { useTagStore } from "@/store/tags";
import { useUIStore } from "@/store/ui";

const mockTags = [
	{ id: "tag1", name: "Work", color: "#e11d48" },
	{ id: "tag2", name: "Personal", color: "#16a34a" },
];

beforeEach(() => {
	useTagStore.setState({
		tags: mockTags,
		loadTags: vi.fn(),
		createTag: vi.fn(),
		updateTag: vi.fn(),
		deleteTag: vi.fn(),
	});
	useUIStore.setState({
		activeFilters: {},
		selectedProjectId: undefined,
		selectedTaskId: null,
		sidebarCollapsed: false,
		setSidebarCollapsed: vi.fn(),
		setSelectedProject: vi.fn(),
		setSelectedTask: vi.fn(),
		setFilters: useUIStore.getState().setFilters,
	});
});

describe("FilterBar tag filter", () => {
	it("renders a Tags button", () => {
		render(<FilterBar />);
		expect(screen.getByRole("button", { name: /tags/i })).toBeInTheDocument();
	});

	it("opens tag list popover on click", async () => {
		const user = userEvent.setup();
		render(<FilterBar />);
		await user.click(screen.getByRole("button", { name: /tags/i }));
		expect(screen.getByText("Work")).toBeInTheDocument();
		expect(screen.getByText("Personal")).toBeInTheDocument();
	});

	it("adds a tag id to activeFilters.tagIds when a tag is clicked", async () => {
		const user = userEvent.setup();
		render(<FilterBar />);
		await user.click(screen.getByRole("button", { name: /tags/i }));
		await user.click(screen.getByText("Work"));
		expect(useUIStore.getState().activeFilters.tagIds).toContain("tag1");
	});

	it("shows selected tag highlighted in popover", async () => {
		const user = userEvent.setup();
		useUIStore.setState((s) => ({ ...s, activeFilters: { tagIds: ["tag1"] } }));
		render(<FilterBar />);
		await user.click(screen.getByRole("button", { name: /tags/i }));
		const workButton = screen.getByText("Work").closest("button");
		expect(workButton).toHaveClass("bg-accent");
	});

	it("removes a tag from filters when clicked again in the popover", async () => {
		const user = userEvent.setup();
		useUIStore.setState((s) => ({ ...s, activeFilters: { tagIds: ["tag1"] } }));
		render(<FilterBar />);
		await user.click(screen.getByRole("button", { name: /tags/i }));
		await user.click(screen.getByText("Work"));
		expect(useUIStore.getState().activeFilters.tagIds).not.toContain("tag1");
	});

	it("shows tag count in button label when tags are selected", () => {
		useUIStore.setState((s) => ({
			...s,
			activeFilters: { tagIds: ["tag1", "tag2"] },
		}));
		render(<FilterBar />);
		expect(
			screen.getByRole("button", { name: /tags · 2/i }),
		).toBeInTheDocument();
	});
});
