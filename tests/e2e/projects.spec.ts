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

test("manages a project's tags from its edit dialog", async ({ page }) => {
	await page.getByLabel("New project").click();
	await page.getByPlaceholder("Project name").fill("Tagged");
	await page.getByRole("button", { name: "Create" }).click();

	await page.locator("button", { hasText: "Tagged" }).hover();
	await page.getByLabel("Project options").click();
	await page.getByRole("menuitem").filter({ hasText: "Edit" }).click();

	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("Tag name").fill("Urgent");
	await dialog.getByRole("button", { name: "New tag", exact: true }).click();
	await expect(dialog.getByText("Urgent")).toBeVisible();

	await dialog.getByPlaceholder("Tag name").fill("Urgent");
	await page.keyboard.press("Enter");
	await expect(dialog.getByRole("alert")).toContainText("already exists");
	await dialog.getByPlaceholder("Tag name").clear();

	await dialog.getByRole("button", { name: "Edit tag Urgent" }).click();
	await dialog.getByLabel("Tag name", { exact: true }).fill("Soon");
	await page.keyboard.press("Enter");
	await expect(dialog.getByText("Soon")).toBeVisible();

	await dialog.getByRole("button", { name: "Delete tag Soon" }).click();
	await expect(dialog.getByText("Soon")).not.toBeVisible();
});

test("creates a tag from the project's context menu", async ({ page }) => {
	await page.getByLabel("New project").click();
	await page.getByPlaceholder("Project name").fill("Tagged");
	await page.getByRole("button", { name: "Create" }).click();

	await page
		.getByRole("button", { name: "Tagged", exact: true })
		.click({ button: "right" });
	await page.getByRole("menuitem", { name: "New tag" }).click();

	await page.getByPlaceholder("Tag name").fill("Urgent");
	// The form must survive the pointer leaving it.
	await page.mouse.move(600, 500);
	await page.keyboard.press("Enter");
	await expect(page.getByRole("dialog")).not.toBeVisible();

	await page
		.locator(".glass-sidebar")
		.getByRole("button", { name: "Tags", exact: true })
		.click();
	await expect(page.getByText("Urgent")).toBeVisible();
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

test("archives a project with its tasks, then restores it", async ({
	page,
}) => {
	await page.getByLabel("New project").click();
	await page.getByPlaceholder("Project name").fill("Dormant");
	await page.getByRole("button", { name: "Create" }).click();
	const navItem = page.getByRole("button", { name: "Dormant", exact: true });
	await navItem.click();
	await page.getByLabel("Task title").fill("Sleeping task");
	await page.getByLabel("Task title").press("Enter");
	await expect(page.getByText("Sleeping task")).toBeVisible();

	await page.locator("button", { hasText: "Dormant" }).hover();
	await page.getByLabel("Project options").click();
	await page.getByRole("menuitem").filter({ hasText: "Archive" }).click();

	await expect(navItem).toBeHidden();
	await expect(page.getByText("Sleeping task")).toBeHidden();

	await page.getByRole("button", { name: "Archives" }).click();
	await page
		.getByRole("button", { name: /Dormant/ })
		.first()
		.click();
	await expect(page.getByText("Sleeping task")).toBeVisible();
	await expect(page.getByText(/read-only/)).toBeVisible();
	await expect(page.getByLabel("Task title")).toBeHidden();

	await page.getByRole("button", { name: "Restore project" }).click();
	await expect(navItem).toBeVisible();
	await expect(page.getByLabel("Task title")).toBeVisible();
	await expect(page.getByText("Sleeping task")).toBeVisible();
});
