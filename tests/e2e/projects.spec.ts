import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/index.test.html");
	await expect(page.getByLabel("Task title")).toBeVisible();
});

test("creates a project", async ({ page }) => {
	await page.getByLabel("New project").click();
	await page.getByPlaceholder("Project name").fill("My Project");
	await page.getByRole("button", { name: "Create" }).click();

	await expect(
		page.getByRole("button", { name: "My Project", exact: true }),
	).toBeVisible();
});

test("renames a project", async ({ page }) => {
	await page.getByLabel("New project").click();
	await page.getByPlaceholder("Project name").fill("Old Name");
	await page.getByRole("button", { name: "Create" }).click();
	await expect(
		page.getByRole("button", { name: "Old Name", exact: true }),
	).toBeVisible();

	const projectNavItem = page.locator("button", { hasText: "Old Name" });
	await projectNavItem.hover();
	await page.getByLabel("Project options").click();
	await page.getByRole("menuitem").filter({ hasText: "Edit" }).click();

	await page.getByPlaceholder("Project name").clear();
	await page.getByPlaceholder("Project name").fill("New Name");
	await page.getByRole("button", { name: "Save" }).click();

	await expect(
		page.getByRole("button", { name: "New Name", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Old Name", exact: true }),
	).not.toBeVisible();
});

test("deletes a project", async ({ page }) => {
	await page.getByLabel("New project").click();
	await page.getByPlaceholder("Project name").fill("Temp Project");
	await page.getByRole("button", { name: "Create" }).click();
	await expect(
		page.getByRole("button", { name: "Temp Project", exact: true }),
	).toBeVisible();

	const projectNavItem = page.locator("button", { hasText: "Temp Project" });
	await projectNavItem.hover();
	await page.getByLabel("Project options").click();
	await page.getByRole("menuitem").filter({ hasText: "Delete" }).click();

	await expect(
		page.getByRole("button", { name: "Temp Project", exact: true }),
	).not.toBeVisible();
});
