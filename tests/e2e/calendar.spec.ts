import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/index.test.html");
	await expect(page.getByLabel("Task title")).toBeVisible();
});

test("Calendar link appears in sidebar", async ({ page }) => {
	await expect(
		page.locator(".glass-sidebar").getByRole("button", { name: "Calendar" }),
	).toBeVisible();
});

test("clicking Calendar navigates to calendar view", async ({ page }) => {
	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Calendar" })
		.click();

	await expect(page.locator(".glass-header")).toBeVisible();
});

test("task with dueDate appears in calendar on the correct day", async ({
	page,
}) => {
	const today = new Date().toISOString().slice(0, 10);

	await page.evaluate(async (date) => {
		await window.__REPO__.createTask({ title: "Calendar task", dueDate: date });
		await window.__reloadStores();
	}, today);

	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Calendar" })
		.click();

	await expect(page.locator('[title="Calendar task"]')).toBeVisible();
});

test("completed task appears on its completion date in calendar", async ({
	page,
}) => {
	await page.evaluate(async () => {
		const task = await window.__REPO__.createTask({
			title: "Done task",
			dueDate: "2026-01-01",
		});
		await window.__REPO__.completeTask(task.id);
		await window.__reloadStores();
	});

	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Calendar" })
		.click();

	await expect(page.locator('[title="Done task"]')).toBeVisible();
});

test("clicking a day shows QuickAddTask", async ({ page }) => {
	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Calendar" })
		.click();

	const dayNumber = new Date().getDate().toString();
	await page.locator(`text="${dayNumber}"`).first().click();

	await expect(page.getByLabel("Task title")).toBeVisible();
});

test("creating a task from calendar day adds it to the calendar", async ({
	page,
}) => {
	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Calendar" })
		.click();

	const dayNumber = new Date().getDate().toString();
	await page.locator(`text="${dayNumber}"`).first().click();

	await page.getByLabel("Task title").fill("New calendar task");
	await page.keyboard.press("Enter");

	await expect(page.locator('[title="New calendar task"]')).toBeVisible();
});

test("clicking a task in calendar opens the task detail panel", async ({
	page,
}) => {
	const today = new Date().toISOString().slice(0, 10);

	await page.evaluate(async (date) => {
		await window.__REPO__.createTask({ title: "Nav task", dueDate: date });
		await window.__reloadStores();
	}, today);

	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Calendar" })
		.click();

	await page.locator('[title="Nav task"]').click();

	await expect(page.locator(".detail-panel-animate")).toBeVisible();
});
