import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveView } from "@/components/layout/ArchiveView";
import i18n from "@/i18n";
import { useProjectStore } from "@/store/projects";
import { useTaskStore } from "@/store/tasks";
import type { Project, Task } from "@/types";

vi.mock("@/store/repository", () => ({
	getRepository: vi.fn(() => ({})),
}));

const mockTasks: Task[] = [
	{
		id: "t1",
		title: "Rapport Q2",
		projectId: "proj-marketing",
		completedAt: null,
		deletedAt: "2026-05-20",
		priority: "none",
		dueDate: null,
		description: null,
		tags: [],
		sortOrder: 0,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-05-20T00:00:00.000Z",
	},
	{
		id: "t2",
		title: "Maquette login",
		projectId: "proj-design",
		completedAt: null,
		deletedAt: "2026-05-21",
		priority: "none",
		dueDate: null,
		description: null,
		tags: [],
		sortOrder: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-05-21T00:00:00.000Z",
	},
	{
		id: "t3",
		title: "Fixer le bug nav",
		projectId: null,
		completedAt: null,
		deletedAt: "2026-05-22",
		priority: "none",
		dueDate: null,
		description: null,
		tags: [],
		sortOrder: 2,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-05-22T00:00:00.000Z",
	},
];

const mockProjects: Project[] = [
	{
		id: "proj-marketing",
		name: "Marketing",
		color: null,
		icon: null,
		sortOrder: 0,
		groupId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
	{
		id: "proj-design",
		name: "Design",
		color: null,
		icon: null,
		sortOrder: 1,
		groupId: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];

function setupWithTasks() {
	useTaskStore.setState({
		archivedTasks: mockTasks,
		loadArchivedTasks: vi.fn(),
		unarchiveTask: vi.fn(),
		deleteTask: vi.fn(),
	});
	useProjectStore.setState({ projects: mockProjects });
	return render(<ArchiveView />);
}

describe("ArchiveView — filtres", () => {
	beforeEach(async () => {
		await i18n.changeLanguage("fr");
		vi.clearAllMocks();
	});

	it("affiche toutes les tâches archivées par défaut", () => {
		setupWithTasks();
		expect(screen.getByText("Rapport Q2")).toBeInTheDocument();
		expect(screen.getByText("Maquette login")).toBeInTheDocument();
		expect(screen.getByText("Fixer le bug nav")).toBeInTheDocument();
	});

	it("filtre par texte de recherche (insensible à la casse)", async () => {
		setupWithTasks();
		const user = userEvent.setup();
		const searchInput = screen.getByRole("textbox", { name: /rechercher/i });
		await user.type(searchInput, "rapport");
		expect(screen.getByText("Rapport Q2")).toBeInTheDocument();
		expect(screen.queryByText("Maquette login")).not.toBeInTheDocument();
		expect(screen.queryByText("Fixer le bug nav")).not.toBeInTheDocument();
	});

	it("efface la recherche avec le bouton X", async () => {
		setupWithTasks();
		const user = userEvent.setup();
		const searchInput = screen.getByRole("textbox", { name: /rechercher/i });
		await user.type(searchInput, "rapport");
		const clearButton = screen.getByRole("button", { name: /clear search/i });
		await user.click(clearButton);
		expect(screen.getByText("Rapport Q2")).toBeInTheDocument();
		expect(screen.getByText("Maquette login")).toBeInTheDocument();
		expect(screen.getByText("Fixer le bug nav")).toBeInTheDocument();
	});

	it("filtre par un projet via le multi-select", async () => {
		setupWithTasks();
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /filtre projets/i }));
		await user.click(screen.getByRole("button", { name: "Marketing" }));
		expect(screen.getByText("Rapport Q2")).toBeInTheDocument();
		expect(screen.queryByText("Maquette login")).not.toBeInTheDocument();
		expect(screen.queryByText("Fixer le bug nav")).not.toBeInTheDocument();
	});

	it("filtre par plusieurs projets (Inbox + un projet)", async () => {
		setupWithTasks();
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /filtre projets/i }));
		await user.click(screen.getByRole("button", { name: "Design" }));
		await user.click(screen.getByRole("button", { name: "Inbox" }));
		expect(screen.queryByText("Rapport Q2")).not.toBeInTheDocument();
		expect(screen.getByText("Maquette login")).toBeInTheDocument();
		expect(screen.getByText("Fixer le bug nav")).toBeInTheDocument();
	});

	it("affiche le message noResults quand aucune tâche ne correspond", async () => {
		setupWithTasks();
		const user = userEvent.setup();
		const searchInput = screen.getByRole("textbox", { name: /rechercher/i });
		await user.type(searchInput, "xyz_aucun_résultat");
		expect(
			screen.getByText(/aucune tâche ne correspond aux filtres/i),
		).toBeInTheDocument();
	});

	it("n'affiche pas le select projet si aucune tâche n'a de projet", () => {
		useTaskStore.setState({
			archivedTasks: [mockTasks[2]], // seule la tâche sans projet
			loadArchivedTasks: vi.fn(),
			unarchiveTask: vi.fn(),
			deleteTask: vi.fn(),
		});
		useProjectStore.setState({ projects: mockProjects });
		render(<ArchiveView />);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(screen.getByText("Fixer le bug nav")).toBeInTheDocument();
	});
});
