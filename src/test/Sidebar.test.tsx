import { act, render, screen } from "@testing-library/react";
import "@/i18n";
import { vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { useProjectStore } from "@/store/projects";
import { useSettingsStore } from "@/store/settings";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({
		setSetting: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockResolvedValue({}),
	})),
}));

vi.mock("@/hooks/useUpdater", () => ({
	useUpdaterContext: () => ({
		status: "idle",
		checkForUpdate: vi.fn(),
	}),
	UpdaterContext: {
		Provider: ({ children }: { children: React.ReactNode }) => children,
	},
}));

vi.mock("@tauri-apps/api/app", () => ({
	getVersion: vi.fn().mockResolvedValue("1.0.0"),
}));

const mockSetSelectedProject = vi.fn();

function setupStores({
	calendarVisible = true,
	archivesVisible = true,
	tagsVisible = true,
	selectedProjectId = undefined as string | undefined,
} = {}) {
	useProjectStore.setState({ projects: [] });
	useTaskStore.setState({ allCount: 0, todayCount: 0 });
	useSettingsStore.setState({ calendarVisible, archivesVisible, tagsVisible });
	useUIStore.setState({
		sidebarCollapsed: false,
		selectedProjectId,
		setSelectedProject: mockSetSelectedProject,
		setSidebarCollapsed: vi.fn(),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	setupStores();
});

describe("Sidebar — view visibility", () => {
	it("renders Calendar nav item when calendarVisible is true", () => {
		setupStores({ calendarVisible: true });
		render(<Sidebar />);
		expect(
			screen.getByRole("button", { name: /^(calendar|calendrier)$/i }),
		).toBeInTheDocument();
	});

	it("hides Calendar nav item when calendarVisible is false", () => {
		setupStores({ calendarVisible: false });
		render(<Sidebar />);
		expect(
			screen.queryByRole("button", { name: /^(calendar|calendrier)$/i }),
		).not.toBeInTheDocument();
	});

	it("hides Archives nav item when archivesVisible is false", () => {
		setupStores({ archivesVisible: false });
		render(<Sidebar />);
		expect(
			screen.queryByRole("button", { name: /^archives$/i }),
		).not.toBeInTheDocument();
	});

	it("hides Tags nav item when tagsVisible is false", () => {
		setupStores({ tagsVisible: false });
		render(<Sidebar />);
		expect(
			screen.queryByRole("button", { name: /^tags$/i }),
		).not.toBeInTheDocument();
	});
});

describe("Sidebar — redirect on active view hidden", () => {
	it("calls setSelectedProject(undefined) when active view is Calendar and calendarVisible becomes false", async () => {
		setupStores({ calendarVisible: true, selectedProjectId: "calendar" });
		render(<Sidebar />);

		await act(async () => {
			useSettingsStore.setState({ calendarVisible: false });
		});

		expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
		expect(mockSetSelectedProject).toHaveBeenCalledTimes(1);
	});

	it("calls setSelectedProject(undefined) when active view is Archives and archivesVisible becomes false", async () => {
		setupStores({ archivesVisible: true, selectedProjectId: "archives" });
		render(<Sidebar />);

		await act(async () => {
			useSettingsStore.setState({ archivesVisible: false });
		});

		expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
		expect(mockSetSelectedProject).toHaveBeenCalledTimes(1);
	});

	it("calls setSelectedProject(undefined) when active view is Tags and tagsVisible becomes false", async () => {
		setupStores({ tagsVisible: true, selectedProjectId: "tags" });
		render(<Sidebar />);

		await act(async () => {
			useSettingsStore.setState({ tagsVisible: false });
		});

		expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
		expect(mockSetSelectedProject).toHaveBeenCalledTimes(1);
	});

	it("does NOT redirect when active view is Today (always visible)", async () => {
		setupStores({ calendarVisible: false, selectedProjectId: "today" });
		render(<Sidebar />);
		expect(mockSetSelectedProject).not.toHaveBeenCalled();
	});
});
