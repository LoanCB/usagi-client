import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.test.html");
  await expect(page.getByLabel("Task title")).toBeVisible();
});

test("creates a task via QuickAddTask", async ({ page }) => {
  await page.getByLabel("Task title").fill("Buy groceries");
  await page.keyboard.press("Enter");

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Buy groceries" }),
  ).toBeVisible();
});

test("input is cleared after creating a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Buy groceries");
  await page.keyboard.press("Enter");

  await expect(page.getByLabel("Task title")).toHaveValue("");
});

test("creates a task via TaskForm dialog", async ({ page }) => {
  await page.getByLabel("New task").click();

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Task title").fill("Task from form");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(
    page.locator(".task-row-animate").filter({ hasText: "Task from form" }),
  ).toBeVisible();
});

test("completes a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Walk the dog");
  await page.keyboard.press("Enter");

  const row = page.locator(".task-row-animate").filter({ hasText: "Walk the dog" });
  await row.getByRole("checkbox").click();

  await expect(row.getByRole("button", { name: "Walk the dog" })).toHaveClass(
    /line-through/,
  );
  await expect(row.getByRole("checkbox")).toBeChecked();
});

test("uncompletes a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Read a book");
  await page.keyboard.press("Enter");

  const row = page.locator(".task-row-animate").filter({ hasText: "Read a book" });
  await row.getByRole("checkbox").click();
  await row.getByRole("checkbox").click();

  await expect(row.getByRole("button", { name: "Read a book" })).not.toHaveClass(
    /line-through/,
  );
  await expect(row.getByRole("checkbox")).not.toBeChecked();
});

test("deletes a task", async ({ page }) => {
  await page.getByLabel("Task title").fill("Task to delete");
  await page.keyboard.press("Enter");

  const row = page.locator(".task-row-animate").filter({ hasText: "Task to delete" });
  await row.getByRole("button", { name: "Task to delete" }).click();
  await page.getByRole("button", { name: "Delete task" }).click();

  await expect(row).not.toBeVisible();
});
