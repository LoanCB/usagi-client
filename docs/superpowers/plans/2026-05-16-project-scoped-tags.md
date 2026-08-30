# Project-Scoped Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional project affiliation to tags so they can be generic (shared across all contexts) or specific to one project.

**Architecture:** Single nullable `project_id` column added to the `tags` table via migration. Filtering happens locally in `TagSelector` by comparing against the task's `projectId`. `TagManager` groups all tags by project. Project deletion cascades to soft-delete its tags and hard-delete the related `task_tags` rows.

**Tech Stack:** TypeScript, React, Vitest, SQLite via tauri-plugin-sql, Zustand, i18next

---

## File Map

| Action | File                                           |
| ------ | ---------------------------------------------- |
| Create | `src/db/migrations/004_tags_project_scope.sql` |
| Modify | `src/App.tsx`                                  |
| Modify | `src/types/index.ts`                           |
| Modify | `src/db/repository.ts`                         |
| Modify | `src/test-harness/MemoryRepository.ts`         |
| Modify | `src/db/sqlite-repository.ts`                  |
| Modify | `src/db/sqlite-repository.test.ts`             |
| Modify | `src/store/tags.test.ts`                       |
| Modify | `src/i18n/locales/en.ts`                       |
| Modify | `src/i18n/locales/fr.ts`                       |
| Modify | `src/components/tasks/TagSelector.tsx`         |
| Modify | `src/components/layout/TaskDetail.tsx`         |
| Modify | `src/components/tasks/TaskForm.tsx`            |
| Modify | `src/components/tags/TagManager.tsx`           |

---

## Task 1: Migration SQL + App.tsx registration

**Files:**

- Create: `src/db/migrations/004_tags_project_scope.sql`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the migration file**

Create `src/db/migrations/004_tags_project_scope.sql` with this content:

```sql
ALTER TABLE tags ADD COLUMN project_id TEXT REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_tags_project_id ON tags(project_id);
```

- [ ] **Step 2: Register the migration in App.tsx**

In `src/App.tsx`, add the import after `migration003`:

```ts
import migration004 from "@/db/migrations/004_tags_project_scope.sql?raw";
```

Update the migration loop from:

```ts
for (const migration of [migrationSql, migration002, migration003]) {
```

to:

```ts
for (const migration of [migrationSql, migration002, migration003, migration004]) {
```

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/004_tags_project_scope.sql src/App.tsx
git commit -m "feat: add project_id column to tags table"
```

---

## Task 2: Update TypeScript types

**Files:**

- Modify: `src/types/index.ts`

- [ ] **Step 1: Update Tag and CreateTagInput interfaces**

In `src/types/index.ts`, update `Tag`:

```ts
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  projectId: string | null;
}
```

Update `CreateTagInput`:

```ts
export interface CreateTagInput {
  name: string;
  color?: string;
  projectId?: string | null;
}
```

- [ ] **Step 2: Run tests to see what breaks**

```bash
pnpm test:run 2>&1 | grep -E "FAIL|Error" | head -20
```

Expected: Some failures because `baseTag` fixtures are missing `projectId`. These will be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add projectId to Tag and CreateTagInput types"
```

---

## Task 3: Update repository interface + MemoryRepository

**Files:**

- Modify: `src/db/repository.ts`
- Modify: `src/test-harness/MemoryRepository.ts`

- [ ] **Step 1: Update TodoRepository interface**

In `src/db/repository.ts`, replace the Tags section:

```ts
// Tags
getTags(projectId?: string | null): Promise<Tag[]>;
createTag(input: CreateTagInput): Promise<Tag>;
updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag>;
deleteTag(id: string): Promise<void>;
isTagUsedInProjectTasks(tagId: string): Promise<boolean>;
```

- [ ] **Step 2: Update MemoryRepository**

In `src/test-harness/MemoryRepository.ts`, update `getTags`:

```ts
async getTags(projectId?: string | null): Promise<Tag[]> {
  const all = Array.from(this.tags.values());
  if (projectId === undefined) return all;
  if (projectId === null) return all.filter((t) => t.projectId === null);
  return all.filter((t) => t.projectId === null || t.projectId === projectId);
}
```

Update `createTag` to set `projectId`:

```ts
async createTag(input: CreateTagInput): Promise<Tag> {
  const tag: Tag = {
    id: uuid(),
    name: input.name,
    color: input.color ?? null,
    projectId: input.projectId ?? null,
  };
  this.tags.set(tag.id, tag);
  return tag;
}
```

Update `deleteProject` to cascade-delete project tags and their `task_tags`:

```ts
async deleteProject(id: string): Promise<void> {
  const projectTagIds = Array.from(this.tags.values())
    .filter((t) => t.projectId === id)
    .map((t) => t.id);
  for (const tagId of projectTagIds) {
    this.tags.delete(tagId);
  }
  for (const [tid, task] of this.tasks) {
    const filteredTags = task.tags.filter((t) => !projectTagIds.includes(t.id));
    this.tasks.set(tid, { ...task, tags: filteredTags });
  }
  this.projects.delete(id);
}
```

Add `isTagUsedInProjectTasks` method:

```ts
async isTagUsedInProjectTasks(tagId: string): Promise<boolean> {
  return Array.from(this.tasks.values()).some(
    (task) => task.projectId !== null && task.tags.some((t) => t.id === tagId),
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/db/repository.ts src/test-harness/MemoryRepository.ts
git commit -m "feat: update TodoRepository interface and MemoryRepository for project-scoped tags"
```

---

## Task 4: SqliteRepository — getTags, mapTag, createTag, updateTag

**Files:**

- Modify: `src/db/sqlite-repository.ts`
- Test: `src/db/sqlite-repository.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/db/sqlite-repository.test.ts`, replace the entire `"SqliteRepository — tags"` describe block:

```ts
describe("SqliteRepository — tags", () => {
  it("createTag inserts a row and returns a Tag", async () => {
    const db = makeDb({
      select: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "tag-1", name: "urgent", color: "#f00", project_id: null },
        ]),
    });
    const repo = new SqliteRepository(db);
    const tag = await repo.createTag({ name: "urgent", color: "#f00" });
    expect(tag.name).toBe("urgent");
    expect(tag.color).toBe("#f00");
    expect(tag.projectId).toBeNull();
  });

  it("createTag with projectId persists project_id", async () => {
    const db = makeDb({
      select: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "tag-2", name: "work-tag", color: null, project_id: "proj-1" },
        ]),
    });
    const repo = new SqliteRepository(db);
    await repo.createTag({ name: "work-tag", projectId: "proj-1" });
    const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params).toContain("proj-1");
  });

  it("getTags without argument returns all tags", async () => {
    const db = makeDb({
      select: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "t1", name: "work", color: null, project_id: null },
        ]),
    });
    const repo = new SqliteRepository(db);
    const tags = await repo.getTags();
    expect(tags).toHaveLength(1);
    expect(tags[0].projectId).toBeNull();
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at IS NULL");
    expect(sql).not.toContain("AND project_id");
  });

  it("getTags(null) returns only generic tags", async () => {
    const db = makeDb({ select: vi.fn().mockResolvedValueOnce([]) });
    const repo = new SqliteRepository(db);
    await repo.getTags(null);
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("project_id IS NULL");
    expect(sql).not.toContain("OR project_id IS NULL");
  });

  it("getTags('proj-1') returns project tags and generic tags", async () => {
    const db = makeDb({ select: vi.fn().mockResolvedValueOnce([]) });
    const repo = new SqliteRepository(db);
    await repo.getTags("proj-1");
    const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("project_id = ?");
    expect(sql).toContain("OR project_id IS NULL");
    expect(params).toContain("proj-1");
  });

  it("getTags returns only non-deleted rows", async () => {
    const db = makeDb({
      select: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "t1", name: "work", color: null, project_id: null },
        ]),
    });
    const repo = new SqliteRepository(db);
    const tags = await repo.getTags();
    expect(tags).toHaveLength(1);
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("deleted_at IS NULL");
  });

  it("deleteTag sets deleted_at (soft delete)", async () => {
    const db = makeDb();
    const repo = new SqliteRepository(db);
    await repo.deleteTag("tag-1");
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(sql).toContain("deleted_at");
    expect(params).toContain("tag-1");
  });

  it("updateTag updates specified fields and sets updated_at", async () => {
    const db = makeDb({
      select: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "t1", name: "urgent", color: "#f00", project_id: null },
        ]),
    });
    const repo = new SqliteRepository(db);
    await repo.updateTag("t1", { color: "#f00" });
    const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain("color = ?");
    expect(sql).toContain("updated_at = ?");
  });

  it("updateTag with projectId updates project_id field", async () => {
    const db = makeDb({
      select: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "t1", name: "urgent", color: null, project_id: "proj-1" },
        ]),
    });
    const repo = new SqliteRepository(db);
    await repo.updateTag("t1", { projectId: "proj-1" });
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(sql).toContain("project_id = ?");
    expect(params).toContain("proj-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:run 2>&1 | grep -E "SqliteRepository — tags|FAIL|✓|×" | head -20
```

Expected: Multiple failures — `tag.projectId` undefined, wrong SQL shapes.

- [ ] **Step 3: Update TagRow, mapTag, \_getTag, getTags, createTag, updateTag in sqlite-repository.ts**

Update the `TagRow` interface:

```ts
interface TagRow {
  id: string;
  name: string;
  color: string | null;
  project_id: string | null;
}
```

Update `mapTag`:

```ts
function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    projectId: row.project_id,
  };
}
```

Replace `getTags`:

```ts
async getTags(projectId?: string | null): Promise<Tag[]> {
  if (projectId === null) {
    const rows = await this.db.select<TagRow>(
      "SELECT id, name, color, project_id FROM tags WHERE deleted_at IS NULL AND project_id IS NULL ORDER BY name",
    );
    return rows.map(mapTag);
  }
  if (projectId !== undefined) {
    const rows = await this.db.select<TagRow>(
      "SELECT id, name, color, project_id FROM tags WHERE deleted_at IS NULL AND (project_id = ? OR project_id IS NULL) ORDER BY name",
      [projectId],
    );
    return rows.map(mapTag);
  }
  const rows = await this.db.select<TagRow>(
    "SELECT id, name, color, project_id FROM tags WHERE deleted_at IS NULL ORDER BY name",
  );
  return rows.map(mapTag);
}
```

Replace `createTag`:

```ts
async createTag(input: CreateTagInput): Promise<Tag> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await this.db.execute(
    "INSERT INTO tags (id, name, color, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, input.name, input.color ?? null, input.projectId ?? null, now, now],
  );
  const tag = await this._getTag(id);
  if (!tag) throw new Error(`Tag not found after write: ${id}`);
  return tag;
}
```

Replace `updateTag`:

```ts
async updateTag(id: string, patch: Partial<CreateTagInput>): Promise<Tag> {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];
  if ("name" in patch) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if ("color" in patch) {
    sets.push("color = ?");
    params.push(patch.color ?? null);
  }
  if ("projectId" in patch) {
    sets.push("project_id = ?");
    params.push(patch.projectId ?? null);
  }
  params.push(id);
  await this.db.execute(
    `UPDATE tags SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  const tag = await this._getTag(id);
  if (!tag) throw new Error(`Tag not found after write: ${id}`);
  return tag;
}
```

Replace `_getTag`:

```ts
private async _getTag(id: string): Promise<Tag | null> {
  const rows = await this.db.select<TagRow>(
    "SELECT id, name, color, project_id FROM tags WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return rows[0] ? mapTag(rows[0]) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:run 2>&1 | grep -E "SqliteRepository — tags|FAIL" | head -20
```

Expected: All `SqliteRepository — tags` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: add project_id support to SqliteRepository tag methods"
```

---

## Task 5: SqliteRepository — isTagUsedInProjectTasks

**Files:**

- Modify: `src/db/sqlite-repository.ts`
- Test: `src/db/sqlite-repository.test.ts`

- [ ] **Step 1: Write failing tests**

Add these two tests inside the `"SqliteRepository — tags"` describe block in `src/db/sqlite-repository.test.ts`:

```ts
it("isTagUsedInProjectTasks returns true when tag is used by a task in a project", async () => {
  const db = makeDb({
    select: vi.fn().mockResolvedValueOnce([{ count: 2 }]),
  });
  const repo = new SqliteRepository(db);
  const result = await repo.isTagUsedInProjectTasks("tag-1");
  expect(result).toBe(true);
  const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(sql).toContain("task_tags");
  expect(sql).toContain("project_id IS NOT NULL");
  expect(params).toContain("tag-1");
});

it("isTagUsedInProjectTasks returns false when tag has no project tasks", async () => {
  const db = makeDb({
    select: vi.fn().mockResolvedValueOnce([{ count: 0 }]),
  });
  const repo = new SqliteRepository(db);
  const result = await repo.isTagUsedInProjectTasks("tag-1");
  expect(result).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:run 2>&1 | grep -E "isTagUsed|FAIL" | head -10
```

Expected: 2 failures — `repo.isTagUsedInProjectTasks is not a function`.

- [ ] **Step 3: Implement isTagUsedInProjectTasks in sqlite-repository.ts**

Add inside the Tags section of `SqliteRepository`, after `_getTag`:

```ts
async isTagUsedInProjectTasks(tagId: string): Promise<boolean> {
  const rows = await this.db.select<{ count: number }>(
    `SELECT COUNT(*) as count FROM task_tags tt
     JOIN tasks t ON t.id = tt.task_id
     WHERE tt.tag_id = ? AND t.project_id IS NOT NULL AND t.deleted_at IS NULL`,
    [tagId],
  );
  return (rows[0]?.count ?? 0) > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:run 2>&1 | grep -E "isTagUsed" | head -10
```

Expected: Both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts
git commit -m "feat: add isTagUsedInProjectTasks to SqliteRepository"
```

---

## Task 6: SqliteRepository — deleteProject cascade

**Files:**

- Modify: `src/db/sqlite-repository.ts`
- Test: `src/db/sqlite-repository.test.ts`

- [ ] **Step 1: Write failing test**

Add this test inside `"SqliteRepository — projects"` describe block in `src/db/sqlite-repository.test.ts`:

```ts
it("deleteProject cascades: removes task_tags, soft-deletes tags, then soft-deletes project", async () => {
  const db = makeDb();
  const repo = new SqliteRepository(db);
  await repo.deleteProject("proj-1");
  const calls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls).toHaveLength(3);
  expect(calls[0][0]).toContain("DELETE FROM task_tags");
  expect(calls[0][1]).toContain("proj-1");
  expect(calls[1][0]).toContain("UPDATE tags SET deleted_at");
  expect(calls[1][1]).toContain("proj-1");
  expect(calls[2][0]).toContain("UPDATE projects SET deleted_at");
  expect(calls[2][1]).toContain("proj-1");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run 2>&1 | grep -E "cascades|FAIL" | head -10
```

Expected: Test fails — `deleteProject` currently calls `db.execute` only once.

- [ ] **Step 3: Replace deleteProject in sqlite-repository.ts**

```ts
async deleteProject(id: string): Promise<void> {
  const now = new Date().toISOString();
  await this.db.execute(
    "DELETE FROM task_tags WHERE tag_id IN (SELECT id FROM tags WHERE project_id = ?)",
    [id],
  );
  await this.db.execute(
    "UPDATE tags SET deleted_at = ?, updated_at = ? WHERE project_id = ?",
    [now, now, id],
  );
  await this.db.execute(
    "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:run 2>&1 | grep -E "SqliteRepository — projects|FAIL" | head -15
```

Expected: All project tests pass.

- [ ] **Step 5: Purge deleted tags from the tag store**

In `src/store/projects.ts`, add an import for `useTagStore` at the top:

```ts
import { useTagStore } from "@/store/tags";
```

Update `deleteProject` in the store:

```ts
async deleteProject(repo, id) {
  await repo.deleteProject(id);
  set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  useTagStore.setState((s) => ({ tags: s.tags.filter((t) => t.projectId !== id) }));
},
```

- [ ] **Step 6: Run all tests**

```bash
pnpm test:run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/db/sqlite-repository.ts src/db/sqlite-repository.test.ts src/store/projects.ts
git commit -m "feat: cascade tag deletion when deleting a project"
```

---

## Task 7: Update store fixture + i18n keys

**Files:**

- Modify: `src/store/tags.test.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1: Update baseTag in tags.test.ts**

In `src/store/tags.test.ts`, update `baseTag`:

```ts
const baseTag: Tag = {
  id: "tag-1",
  name: "urgent",
  color: "#ef4444",
  projectId: null,
};
```

- [ ] **Step 2: Run store tests**

```bash
pnpm test:run 2>&1 | grep -E "useTagStore|FAIL" | head -15
```

Expected: All `useTagStore` tests pass.

- [ ] **Step 3: Add i18n keys to en.ts**

In `src/i18n/locales/en.ts`, update the `tag` section:

```ts
tag: {
  tags: "Tags",
  new: "New tag",
  noTags: "No tags created",
  namePlaceholder: "Tag name",
  delete: "Delete tag",
  edit: "Edit tag",
  generic: "Generic",
  projectConstraint: "This tag is used by tasks in a project and cannot be reassigned.",
},
```

- [ ] **Step 4: Add i18n keys to fr.ts**

In `src/i18n/locales/fr.ts`, update the `tag` section:

```ts
tag: {
  tags: "Tags",
  new: "Nouveau tag",
  noTags: "Aucun tag créé",
  namePlaceholder: "Nom du tag",
  delete: "Supprimer le tag",
  edit: "Modifier le tag",
  generic: "Générique",
  projectConstraint: "Ce tag est utilisé par des tâches dans un projet et ne peut pas être réaffecté.",
},
```

- [ ] **Step 5: Run all tests**

```bash
pnpm test:run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/tags.test.ts src/i18n/locales/en.ts src/i18n/locales/fr.ts
git commit -m "feat: update tag test fixture and add i18n keys for project-scoped tags"
```

---

## Task 8: TagSelector — projectId filtering + auto-assign + wiring

**Files:**

- Modify: `src/components/tasks/TagSelector.tsx`
- Modify: `src/components/layout/TaskDetail.tsx`
- Modify: `src/components/tasks/TaskForm.tsx`

- [ ] **Step 1: Update TagSelector.tsx**

Replace the entire content of `src/components/tasks/TagSelector.tsx`:

```tsx
import { Check, Plus, Tag } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PRESET_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { useTagStore } from "@/store/tags";

interface TagSelectorProps {
  readonly selectedTagIds: string[];
  readonly onChange: (tagIds: string[]) => void;
  readonly triggerClassName?: string;
  readonly projectId?: string | null;
}

export function TagSelector({
  selectedTagIds,
  onChange,
  triggerClassName,
  projectId,
}: TagSelectorProps) {
  const { t } = useTranslation();
  const { tags, createTag } = useTagStore();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[5]);
  const [showCreate, setShowCreate] = useState(false);

  const visibleTags = tags.filter((tag) => {
    if (projectId === undefined) return true;
    if (projectId === null) return tag.projectId === null;
    return tag.projectId === null || tag.projectId === projectId;
  });

  function toggle(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const tag = await createTag(getRepository(), {
      name: newName.trim(),
      color: newColor,
      projectId: projectId ?? null,
    });
    onChange([...selectedTagIds, tag.id]);
    setNewName("");
    setNewColor(PRESET_COLORS[5]);
    setShowCreate(false);
  }

  const selectedTags = visibleTags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-2 h-7 px-2 justify-start flex-wrap max-w-xs",
          triggerClassName,
        )}
      >
        <Tag className="h-3.5 w-3.5 shrink-0" />
        {selectedTags.length === 0 ? (
          <span className="text-xs">{t("tag.tags")}</span>
        ) : (
          selectedTags.map((t) => (
            <Badge
              key={t.id}
              variant="secondary"
              className="text-xs h-4"
              style={
                t.color
                  ? {
                      backgroundColor: `${t.color}28`,
                      color: t.color,
                      borderColor: `${t.color}50`,
                    }
                  : undefined
              }
            >
              {t.name}
            </Badge>
          ))
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {visibleTags.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("tag.noTags")}
            </p>
          )}
          {visibleTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <button
                type="button"
                key={tag.id}
                onClick={() => toggle(tag.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
                  selected && "bg-accent",
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: tag.color ?? "var(--muted-foreground)" }}
                />
                <span className="flex-1 text-left truncate">{tag.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>

        {showCreate ? (
          <div className="mt-2 space-y-2 border-t border-border pt-2">
            <Input
              placeholder={t("tag.namePlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex gap-1 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-4 w-4 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: newColor === c ? `2px solid ${c}` : undefined,
                    outlineOffset: newColor === c ? "2px" : undefined,
                  }}
                  aria-label={t("common.colorOption", { color: c })}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7"
                onClick={() => setShowCreate(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7"
                disabled={!newName.trim()}
                onClick={handleCreate}
              >
                {t("common.create")}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-2 flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border-t border-border pt-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("tag.new")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Pass projectId in TaskDetail.tsx**

In `src/components/layout/TaskDetail.tsx`, find the `<TagSelector>` usage and add `projectId`:

```tsx
<TagSelector
  selectedTagIds={task.tags.map((t) => t.id)}
  onChange={handleTagsChange}
  projectId={task.projectId}
/>
```

- [ ] **Step 3: Pass projectId in TaskForm.tsx**

In `src/components/tasks/TaskForm.tsx`, find the `<TagSelector>` usage and add `projectId`:

```tsx
<TagSelector
  selectedTagIds={tagIds}
  onChange={setTagIds}
  projectId={projectId}
/>
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test:run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/TagSelector.tsx src/components/layout/TaskDetail.tsx src/components/tasks/TaskForm.tsx
git commit -m "feat: filter TagSelector tags by project context and auto-assign on create"
```

---

## Task 9: TagManager — grouped display + project selector + constraint check

**Files:**

- Modify: `src/components/tags/TagManager.tsx`

- [ ] **Step 1: Replace TagManager.tsx**

Replace the entire content of `src/components/tags/TagManager.tsx`:

```tsx
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESET_COLORS } from "@/lib/colors";
import { getRepository } from "@/store/repository";
import { useProjectStore } from "@/store/projects";
import { useTagStore } from "@/store/tags";
import type { Tag } from "@/types";

function ColorPicker({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (c: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="h-5 w-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
          style={{
            background: c,
            outline: value === c ? `2px solid ${c}` : undefined,
            outlineOffset: value === c ? "2px" : undefined,
          }}
          aria-label={t("common.colorOption", { color: c })}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function TagProjectSelect({
  value,
  onChange,
  disabled,
}: {
  readonly value: string | null;
  readonly onChange: (v: string | null) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { projects } = useProjectStore();
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 w-full text-sm rounded-md border border-input bg-background px-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">{t("tag.generic")}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function TagManager() {
  const { t } = useTranslation();
  const { tags, createTag, updateTag, deleteTag } = useTagStore();
  const { projects } = useProjectStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(PRESET_COLORS[5]);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editConstrained, setEditConstrained] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[5]);
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color ?? PRESET_COLORS[5]);
    setEditProjectId(tag.projectId);
    const constrained = await getRepository().isTagUsedInProjectTasks(tag.id);
    setEditConstrained(constrained);
  }

  async function commitEdit() {
    if (!editName.trim() || !editingId) return;
    await updateTag(getRepository(), editingId, {
      name: editName.trim(),
      color: editColor,
      projectId: editProjectId,
    });
    setEditingId(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await createTag(getRepository(), {
      name: newName.trim(),
      color: newColor,
      projectId: newProjectId,
    });
    setNewName("");
    setNewColor(PRESET_COLORS[5]);
    setNewProjectId(null);
    setShowNew(false);
  }

  const genericTags = tags.filter((t) => t.projectId === null);
  const projectGroups = projects
    .map((p) => ({
      project: p,
      tags: tags.filter((t) => t.projectId === p.id),
    }))
    .filter((g) => g.tags.length > 0);

  function renderTag(tag: Tag) {
    if (editingId === tag.id) {
      return (
        <div
          key={tag.id}
          className="rounded-md border border-border p-3 space-y-1.5 mb-1"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: editColor }}
            />
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={commitEdit}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={() => setEditingId(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ColorPicker value={editColor} onChange={setEditColor} />
          <TagProjectSelect
            value={editProjectId}
            onChange={setEditProjectId}
            disabled={editConstrained}
          />
          {editConstrained && (
            <p className="text-xs text-muted-foreground">
              {t("tag.projectConstraint")}
            </p>
          )}
        </div>
      );
    }
    return (
      <div
        key={tag.id}
        className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/40 group"
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ background: tag.color ?? "var(--muted-foreground)" }}
        />
        <span className="flex-1 text-sm truncate">{tag.name}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => startEdit(tag)}
            aria-label={t("tag.edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => deleteTag(getRepository(), tag.id)}
            aria-label={t("tag.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-base">{t("tag.tags")}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowNew(true)}
          aria-label={t("tag.new")}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {showNew && (
          <div className="rounded-md border border-border p-3 space-y-2 mb-2">
            <Input
              placeholder={t("tag.namePlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <TagProjectSelect value={newProjectId} onChange={setNewProjectId} />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNew(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                disabled={!newName.trim()}
                onClick={handleCreate}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {tags.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground text-center py-12">
            {t("tag.noTags")}
          </p>
        )}

        {genericTags.length > 0 && (
          <div>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("tag.generic")}
            </p>
            {genericTags.map(renderTag)}
          </div>
        )}

        {projectGroups.map(({ project, tags: ptags }) => (
          <div key={project.id} className="mt-2">
            <p
              className="px-2 py-1 text-xs font-medium uppercase tracking-wide"
              style={{ color: project.color ?? undefined }}
            >
              {project.name}
            </p>
            {ptags.map(renderTag)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test:run
```

Expected: All tests pass.
