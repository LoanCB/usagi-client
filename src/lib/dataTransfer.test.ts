import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/test-harness/MemoryRepository";
import { INBOX_PROJECT_ID, exportData } from "./dataTransfer";

async function seedRepo() {
  const repo = new MemoryRepository();
  const project = await repo.createProject({ name: "Work", color: "#f00" });
  const tag = await repo.createTag({ name: "urgent", color: "#0f0" });
  await repo.createTask({
    title: "Active task",
    projectId: project.id,
    tagIds: [tag.id],
  });
  const completedTask = await repo.createTask({ title: "Done task" });
  await repo.completeTask(completedTask.id);
  const archivedTask = await repo.createTask({ title: "Archived task" });
  await repo.archiveTask(archivedTask.id);
  return { repo, project, tag };
}

describe("exportData", () => {
  it("exports all data when all options are true", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(result.version).toBe(1);
    expect(result.tasks).toHaveLength(3);
    expect(result.projects).toHaveLength(1);
    expect(result.tags).toHaveLength(1);
    expect(typeof result.exportedAt).toBe("string");
  });

  it("excludes active tasks when activeTasks is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: false,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(result.tasks.every(t => t.completedAt !== null || t.deletedAt !== null)).toBe(true);
    expect(result.tasks).toHaveLength(2);
  });

  it("excludes completed tasks when completedTasks is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: false,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(result.tasks.every(t => t.completedAt === null)).toBe(true);
    expect(result.tasks).toHaveLength(2);
  });

  it("excludes archived tasks when archivedTasks is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: false,
      projects: true,
      tags: true,
    });
    expect(result.tasks.every(t => t.deletedAt === null)).toBe(true);
    expect(result.tasks).toHaveLength(2);
  });

  it("excludes projects when projects is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true, completedTasks: true, archivedTasks: true,
      projects: false, tags: true,
    });
    expect(result.projects).toHaveLength(0);
  });

  it("excludes tags when tags is false", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true, completedTasks: true, archivedTasks: true,
      projects: true, tags: false,
    });
    expect(result.tags).toHaveLength(0);
  });
});

describe("exportData — projectIds filter", () => {
  it("null projectIds exports all tasks", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: null,
    });
    expect(result.tasks).toHaveLength(3);
  });

  it("filters to a specific project only", async () => {
    const { repo, project } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [project.id],
    });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe("Active task");
  });

  it("filters to Inbox only (tasks with no project)", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [INBOX_PROJECT_ID],
    });
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((t) => t.projectId === null)).toBe(true);
  });

  it("filters to project + Inbox together", async () => {
    const { repo, project } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [project.id, INBOX_PROJECT_ID],
    });
    expect(result.tasks).toHaveLength(3);
  });

  it("empty projectIds array exports no tasks", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
      projectIds: [],
    });
    expect(result.tasks).toHaveLength(0);
  });

  it("undefined projectIds exports all tasks (backwards compat)", async () => {
    const { repo } = await seedRepo();
    const result = await exportData(repo, {
      activeTasks: true,
      completedTasks: true,
      archivedTasks: true,
      projects: true,
      tags: true,
    });
    expect(result.tasks).toHaveLength(3);
  });
});

async function seedMultiProject() {
    const repo = new MemoryRepository();
    const projectA = await repo.createProject({ name: "A", color: "#f00" });
    const projectB = await repo.createProject({ name: "B", color: "#00f" });
    const genericTag = await repo.createTag({ name: "generic" });
    const tagA = await repo.createTag({ name: "tagA", projectId: projectA.id });
    const tagB = await repo.createTag({ name: "tagB", projectId: projectB.id });
    await repo.createTask({ title: "Task A", projectId: projectA.id });
    await repo.createTask({ title: "Task B", projectId: projectB.id });
    return { repo, projectA, projectB, genericTag, tagA, tagB };
}

describe("exportData — projectIds filter: projects and tags scoping", () => {
  it("exports only the selected project record, not all", async () => {
    const { repo, projectA } = await seedMultiProject();
    const result = await exportData(repo, {
      activeTasks: true, completedTasks: true, archivedTasks: false,
      projects: true, tags: true,
      projectIds: [projectA.id],
    });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].id).toBe(projectA.id);
  });

  it("forces project export even when projects chip is off", async () => {
    const { repo, projectA } = await seedMultiProject();
    const result = await exportData(repo, {
      activeTasks: true, completedTasks: true, archivedTasks: false,
      projects: false, tags: false,
      projectIds: [projectA.id],
    });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].id).toBe(projectA.id);
  });

  it("exports generic tags and selected-project tags, excludes others", async () => {
    const { repo, projectA, genericTag, tagA, tagB } = await seedMultiProject();
    const result = await exportData(repo, {
      activeTasks: true, completedTasks: true, archivedTasks: false,
      projects: true, tags: true,
      projectIds: [projectA.id],
    });
    const tagIds = result.tags.map((t) => t.id);
    expect(tagIds).toContain(genericTag.id);
    expect(tagIds).toContain(tagA.id);
    expect(tagIds).not.toContain(tagB.id);
  });

  it("Inbox-only filter exports no project records (inbox has none)", async () => {
    const { repo } = await seedMultiProject();
    const result = await exportData(repo, {
      activeTasks: true, completedTasks: true, archivedTasks: false,
      projects: true, tags: true,
      projectIds: [INBOX_PROJECT_ID],
    });
    expect(result.projects).toHaveLength(0);
  });
});
