import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivedProjectBanner } from "@/components/layout/ArchivedProjectBanner";
import { ArchivedProjectsSection } from "@/components/layout/ArchivedProjectsSection";
import { TaskDetail } from "@/components/layout/TaskDetail";
import { TaskList } from "@/components/layout/TaskList";
import { TaskItem } from "@/components/tasks/TaskItem";
import i18n from "@/i18n";
import { useArchiveStore } from "@/store/archives";
import { useProjectStore } from "@/store/projects";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";
import { MemoryRepository } from "@/test-harness/MemoryRepository";
import type { Project, ProjectGroup, Task } from "@/types";

const repo = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/store/repository", () => ({
	getRepository: () => repo.current,
}));

const project: Project = {
	id: "p1",
	name: "Old project",
	color: null,
	icon: null,
	sortOrder: 0,
	sortKey: "a0",
	groupId: null,
	archivedAt: "2026-10-01T10:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const group: ProjectGroup = {
	id: "g1",
	name: "Old group",
	color: "#111111",
	sortOrder: 0,
	sortKey: "a1",
	archivedAt: "2026-10-02T10:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const task: Task = {
	id: "t1",
	title: "Old task",
	description: "<p>notes</p>",
	projectId: "p1",
	priority: "none",
	dueDate: null,
	completedAt: null,
	deletedAt: null,
	tags: [],
	sortOrder: 0,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const restoreProject = vi.fn();
const restoreGroup = vi.fn();

beforeEach(async () => {
	await i18n.changeLanguage("en");
	repo.current = new MemoryRepository();
	restoreProject.mockReset();
	restoreGroup.mockReset();
	useArchiveStore.setState({
		projects: [],
		groups: [],
		tasks: [],
		restoreProject,
		restoreGroup,
	});
	useProjectStore.setState({ projects: [] });
	useTaskStore.setState({ tasks: [] });
	useUIStore.setState({ selectedProjectId: undefined, selectedTaskId: null });
});

describe("ArchivedProjectsSection", () => {
	it("renders nothing without archived projects", () => {
		const { container } = render(<ArchivedProjectsSection />);
		expect(container).toBeEmptyDOMElement();
	});

	it("shows a project's task count and restores it", async () => {
		useArchiveStore.setState({ projects: [project], tasks: [task] });
		render(<ArchivedProjectsSection />);

		expect(screen.getByText(/1 task/)).toBeInTheDocument();
		await userEvent.click(
			screen.getByRole("button", { name: "Restore Old project" }),
		);

		expect(restoreProject).toHaveBeenCalledWith(repo.current, "p1");
	});

	it("opens a project from its row", async () => {
		useArchiveStore.setState({ projects: [project] });
		render(<ArchivedProjectsSection />);

		await userEvent.click(screen.getByRole("button", { name: /^Old project/ }));

		expect(useUIStore.getState().selectedProjectId).toBe("p1");
	});

	it("lists a group's projects without a restore of their own", async () => {
		useArchiveStore.setState({
			projects: [{ ...project, groupId: "g1", archivedAt: null }],
			groups: [group],
		});
		render(<ArchivedProjectsSection />);

		expect(screen.queryByText("Old project")).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: /^Old group/ }));

		expect(screen.getByText("Old project")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Restore Old project" }),
		).not.toBeInTheDocument();
		await userEvent.click(
			screen.getByRole("button", { name: "Restore Old group" }),
		);
		expect(restoreGroup).toHaveBeenCalledWith(repo.current, "g1");
	});

	it("keeps a project archived alone apart once its group is restored", () => {
		useArchiveStore.setState({ projects: [{ ...project, groupId: "gone" }] });
		render(<ArchivedProjectsSection />);

		expect(
			screen.getByRole("button", { name: "Restore Old project" }),
		).toBeInTheDocument();
	});
});

describe("ArchivedProjectBanner", () => {
	it("restores the project", async () => {
		render(<ArchivedProjectBanner project={project} />);

		await userEvent.click(
			screen.getByRole("button", { name: "Restore project" }),
		);

		expect(restoreProject).toHaveBeenCalledWith(repo.current, "p1");
	});

	it("restores the group when the project is archived through it", async () => {
		useArchiveStore.setState({ groups: [group] });
		render(<ArchivedProjectBanner project={{ ...project, groupId: "g1" }} />);

		await userEvent.click(
			screen.getByRole("button", { name: "Restore group" }),
		);

		expect(restoreGroup).toHaveBeenCalledWith(repo.current, "g1");
		expect(restoreProject).not.toHaveBeenCalled();
	});
});

describe("read-only archived project", () => {
	it("offers no way to add a task in TaskList", async () => {
		useArchiveStore.setState({ projects: [project] });
		useUIStore.setState({ selectedProjectId: "p1" });
		render(<TaskList />);

		expect(
			screen.getByRole("heading", { name: "Old project" }),
		).toBeInTheDocument();
		expect(
			within(screen.getByRole("status")).getByRole("button"),
		).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "New task" }),
		).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
	});

	it("still offers it for a live project", () => {
		useProjectStore.setState({ projects: [{ ...project, archivedAt: null }] });
		useUIStore.setState({ selectedProjectId: "p1" });
		render(<TaskList />);

		expect(screen.getByRole("button", { name: "New task" })).toBeVisible();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("disables the task row", () => {
		render(<TaskItem task={task} onDeleteRequest={vi.fn()} readOnly />);

		expect(screen.getByRole("checkbox")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(
			screen.queryByRole("button", { name: "Reorder task" }),
		).not.toBeInTheDocument();
	});

	it("names the archived project in TaskDetail, not the Inbox", () => {
		useArchiveStore.setState({ projects: [project] });
		useTaskStore.setState({ tasks: [task] });
		useUIStore.setState({ selectedTaskId: "t1" });
		render(<TaskDetail width={320} />);

		expect(screen.getByText("Old project")).toBeInTheDocument();
		expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
	});

	it("locks TaskDetail while keeping the task readable", () => {
		useArchiveStore.setState({ projects: [project] });
		useTaskStore.setState({ tasks: [task] });
		useUIStore.setState({ selectedTaskId: "t1" });
		const { container } = render(<TaskDetail width={320} />);

		expect(screen.getByDisplayValue("Old task")).toHaveAttribute("readonly");
		expect(screen.getByRole("button", { name: /Mark/ })).toBeDisabled();
		expect(
			screen.queryByRole("button", { name: "Archive task" }),
		).not.toBeInTheDocument();
		expect(container.querySelector("[inert]")).not.toBeNull();
	});
});
