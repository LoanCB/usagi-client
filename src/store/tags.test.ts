import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoRepository } from "@/db/repository";
import type { Tag } from "@/types";
import { useTagStore } from "./tags";

const baseTag: Tag = {
	id: "tag-1",
	name: "urgent",
	color: "#ef4444",
	projectId: null,
};

function makeRepo(overrides: Partial<TodoRepository> = {}): TodoRepository {
	return {
		getTasks: vi.fn(),
		getTask: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		completeTask: vi.fn(),
		uncompleteTask: vi.fn(),
		deleteTask: vi.fn(),
		reorderTasks: vi.fn(),
		getProjects: vi.fn(),
		createProject: vi.fn(),
		updateProject: vi.fn(),
		deleteProject: vi.fn(),
		getTags: vi.fn().mockResolvedValue([baseTag]),
		createTag: vi.fn().mockResolvedValue(baseTag),
		updateTag: vi.fn().mockResolvedValue(baseTag),
		deleteTag: vi.fn().mockResolvedValue(undefined),
		getSettings: vi.fn().mockResolvedValue({}),
		setSetting: vi.fn().mockResolvedValue(undefined),
		bulkImport: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as TodoRepository;
}

describe("useTagStore", () => {
	beforeEach(() => {
		useTagStore.setState({ tags: [] });
	});

	it("loadTags populates tags from repository", async () => {
		const repo = makeRepo();
		await useTagStore.getState().loadTags(repo);
		expect(useTagStore.getState().tags).toHaveLength(1);
		expect(useTagStore.getState().tags[0].name).toBe("urgent");
	});

	it("createTag appends new tag to list", async () => {
		const newTag: Tag = {
			id: "tag-2",
			name: "work",
			color: "#3b82f6",
			projectId: null,
		};
		const repo = makeRepo({
			createTag: vi.fn().mockResolvedValue(newTag),
		});
		await useTagStore.getState().createTag(repo, { name: "work" });
		const tags = useTagStore.getState().tags;
		expect(tags[tags.length - 1].id).toBe("tag-2");
	});

	it("updateTag replaces the correct tag in-place", async () => {
		const updated: Tag = { ...baseTag, name: "critical" };
		useTagStore.setState({ tags: [baseTag] });
		const repo = makeRepo({
			updateTag: vi.fn().mockResolvedValue(updated),
		});
		await useTagStore.getState().updateTag(repo, "tag-1", { name: "critical" });
		expect(useTagStore.getState().tags[0].name).toBe("critical");
	});

	it("deleteTag removes tag from list", async () => {
		useTagStore.setState({ tags: [baseTag] });
		const repo = makeRepo({
			deleteTag: vi.fn().mockResolvedValue(undefined),
		});
		await useTagStore.getState().deleteTag(repo, "tag-1");
		expect(useTagStore.getState().tags).toHaveLength(0);
	});
});
