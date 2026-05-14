import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/index.test.html");
	await expect(page.getByLabel("Task title")).toBeVisible();
});

test("All tasks view shows tasks from all projects", async ({ page }) => {
	await page.getByLabel("Task title").fill("Task Alpha");
	await page.keyboard.press("Enter");
	await page.getByLabel("Task title").fill("Task Beta");
	await page.keyboard.press("Enter");

	await page.getByRole("button", { name: "All tasks" }).click();

	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Task Alpha" }),
	).toBeVisible();
	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Task Beta" }),
	).toBeVisible();
});

test("search filters task list in real time", async ({ page }) => {
	await page.getByLabel("Task title").fill("Alpha task");
	await page.keyboard.press("Enter");
	await page.getByLabel("Task title").fill("Beta task");
	await page.keyboard.press("Enter");

	await page.getByLabel("Search…").fill("Alpha");

	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Alpha task" }),
	).toBeVisible();
	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Beta task" }),
	).not.toBeVisible();
});

test("search shows all tasks when cleared", async ({ page }) => {
	await page.getByLabel("Task title").fill("Alpha task");
	await page.keyboard.press("Enter");
	await page.getByLabel("Task title").fill("Beta task");
	await page.keyboard.press("Enter");

	await page.getByLabel("Search…").fill("Alpha");
	await page.getByLabel("Search…").clear();

	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Beta task" }),
	).toBeVisible();
});

test("priority filter shows only matching tasks", async ({ page }) => {
	await page.evaluate(async () => {
		await window.__REPO__.createTask({
			title: "High priority task",
			priority: "high",
		});
		await window.__REPO__.createTask({
			title: "Low priority task",
			priority: "low",
		});
		await window.__reloadStores();
	});

	await page.getByRole("button", { name: "Priority", exact: true }).click();
	await page.getByRole("menuitem", { name: "High" }).click();

	await expect(
		page.locator(".task-row-animate").filter({ hasText: "High priority task" }),
	).toBeVisible();
	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Low priority task" }),
	).not.toBeVisible();
});

test("Today view shows only tasks due today", async ({ page }) => {
	await page.evaluate(async () => {
		const today = new Date().toISOString().slice(0, 10);
		await window.__REPO__.createTask({
			title: "Due today task",
			dueDate: today,
		});
		await window.__REPO__.createTask({ title: "No due date task" });
		await window.__reloadStores();
	});

	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Today", exact: true })
		.click();

	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Due today task" }),
	).toBeVisible();
	await expect(
		page.locator(".task-row-animate").filter({ hasText: "No due date task" }),
	).not.toBeVisible();
});

test("selecting a project shows only its tasks", async ({ page }) => {
	await page.evaluate(async () => {
		const project = await window.__REPO__.createProject({
			name: "Work",
			color: "#3b82f6",
			icon: "Folder",
		});
		await window.__REPO__.createTask({
			title: "Work task",
			projectId: project.id,
		});
		await window.__REPO__.createTask({ title: "Inbox task", projectId: null });
		await window.__reloadStores();
	});

	await page
		.locator(".glass-sidebar")
		.getByRole("button")
		.filter({ hasText: "Work" })
		.first()
		.click();

	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Work task" }),
	).toBeVisible();
	await expect(
		page.locator(".task-row-animate").filter({ hasText: "Inbox task" }),
	).not.toBeVisible();
});
