# Sidebar View Visibility Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checkboxes in the Settings dialog that let the user show or hide Calendar, Archives, and Tags from the sidebar, with an automatic redirect to "All Tasks" if the active view is hidden.

**Architecture:** Three booleans (`calendarVisible`, `archivesVisible`, `tagsVisible`) are added to `useSettingsStore`, each persisted as a separate DB key. The `SettingsDialog` gains a new section in its right column (above Notifications) with one `Checkbox` per view. The `Sidebar` reads the flags to conditionally render each `NavItem`, and a `useEffect` redirects to "All Tasks" when the active view is hidden.

**Tech Stack:** React, Zustand, i18next, Vitest, @testing-library/react

---

### Task 1: i18n — Add `settings.sidebarViews` translation key

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

> No test needed — translation keys are plain string literals with no logic.

- [ ] **Step 1: Add key to `en.ts`**

In `src/i18n/locales/en.ts`, inside the `settings` object, add after `glassmorphism`:

```ts
sidebarViews: "Sidebar views",
```

- [ ] **Step 2: Add key to `fr.ts`**

In `src/i18n/locales/fr.ts`, inside the `settings` object, add after `glassmorphism`:

```ts
sidebarViews: "Vues de la sidebar",
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
pnpm tsc --noEmit
```

Expected: no errors (fr.ts is typed `typeof en`, so the compiler enforces the key exists in both).

---

### Task 2: Settings store — Add visibility booleans

**Files:**

- Modify: `src/store/settings.ts`
- Create: `src/store/settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/store/settings.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoRepository } from "@/db/repository";
import { useSettingsStore } from "./settings";

function makeRepo(settings: Record<string, string> = {}): TodoRepository {
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
    getTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(settings),
    setSetting: vi.fn().mockResolvedValue(undefined),
  } as unknown as TodoRepository;
}

beforeEach(() => {
  useSettingsStore.setState({
    calendarVisible: true,
    archivesVisible: true,
    tagsVisible: true,
  });
});

describe("loadSettings — view visibility", () => {
  it("defaults all views to visible when DB keys are absent", async () => {
    const repo = makeRepo({});
    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.loadSettings(repo));
    expect(result.current.calendarVisible).toBe(true);
    expect(result.current.archivesVisible).toBe(true);
    expect(result.current.tagsVisible).toBe(true);
  });

  it("loads false from DB when key is 'false'", async () => {
    const repo = makeRepo({
      calendar_visible: "false",
      archives_visible: "false",
      tags_visible: "false",
    });
    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.loadSettings(repo));
    expect(result.current.calendarVisible).toBe(false);
    expect(result.current.archivesVisible).toBe(false);
    expect(result.current.tagsVisible).toBe(false);
  });
});

describe("setCalendarVisible", () => {
  it("updates state and persists to DB", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.setCalendarVisible(repo, false));
    expect(result.current.calendarVisible).toBe(false);
    expect(repo.setSetting).toHaveBeenCalledWith("calendar_visible", "false");
  });
});

describe("setArchivesVisible", () => {
  it("updates state and persists to DB", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.setArchivesVisible(repo, false));
    expect(result.current.archivesVisible).toBe(false);
    expect(repo.setSetting).toHaveBeenCalledWith("archives_visible", "false");
  });
});

describe("setTagsVisible", () => {
  it("updates state and persists to DB", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useSettingsStore());
    await act(() => result.current.setTagsVisible(repo, false));
    expect(result.current.tagsVisible).toBe(false);
    expect(repo.setSetting).toHaveBeenCalledWith("tags_visible", "false");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: FAIL — `calendarVisible`, `setCalendarVisible`, etc. are not defined.

- [ ] **Step 3: Extend `src/store/settings.ts`**

Add to the `SettingsStore` interface, after `glassmorphismEnabled`:

```ts
calendarVisible: boolean;
archivesVisible: boolean;
tagsVisible: boolean;
setCalendarVisible(repo: TodoRepository, visible: boolean): Promise<void>;
setArchivesVisible(repo: TodoRepository, visible: boolean): Promise<void>;
setTagsVisible(repo: TodoRepository, visible: boolean): Promise<void>;
```

Add to the `create<SettingsStore>((set) => ({` initial state, after `glassmorphismEnabled: false`:

```ts
calendarVisible: true,
archivesVisible: true,
tagsVisible: true,
```

In `loadSettings`, after the `glassmorphismEnabled` line:

```ts
const calendarVisible = raw.calendar_visible !== "false";
const archivesVisible = raw.archives_visible !== "false";
const tagsVisible = raw.tags_visible !== "false";
```

And add the three to the `set({...})` call:

```ts
set({
  notificationsEnabled,
  notificationTimes,
  parallaxEnabled,
  glassmorphismEnabled,
  calendarVisible,
  archivesVisible,
  tagsVisible,
});
```

Add three setters after `setGlassmorphismEnabled`:

```ts
async setCalendarVisible(repo, visible) {
  await repo.setSetting("calendar_visible", String(visible));
  set({ calendarVisible: visible });
},

async setArchivesVisible(repo, visible) {
  await repo.setSetting("archives_visible", String(visible));
  set({ archivesVisible: visible });
},

async setTagsVisible(repo, visible) {
  await repo.setSetting("tags_visible", String(visible));
  set({ tagsVisible: visible });
},
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: all 6 tests PASS.

---

### Task 3: SettingsDialog — Add sidebar views section

**Files:**

- Modify: `src/components/layout/SettingsDialog.tsx`
- Create: `src/test/SidebarViewsSettings.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/test/SidebarViewsSettings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { useSettingsStore } from "@/store/settings";
import { getRepository } from "@/store/repository";
import { vi } from "vitest";

vi.mock("@/store/repository", () => ({
  getRepository: vi.fn(() => ({
    setSetting: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({}),
  })),
}));

function renderDialog() {
  return render(
    <SettingsDialog>
      <button type="button">Open</button>
    </SettingsDialog>,
  );
}

async function openDialog() {
  const user = userEvent.setup();
  renderDialog();
  await user.click(screen.getByRole("button", { name: /open/i }));
  return user;
}

beforeEach(() => {
  useSettingsStore.setState({
    calendarVisible: true,
    archivesVisible: true,
    tagsVisible: true,
    setCalendarVisible: vi.fn(),
    setArchivesVisible: vi.fn(),
    setTagsVisible: vi.fn(),
  });
});

describe("SettingsDialog — sidebar views section", () => {
  it("renders the section heading", async () => {
    await openDialog();
    expect(
      screen.getByText(/sidebar views|vues de la sidebar/i),
    ).toBeInTheDocument();
  });

  it("renders three checked checkboxes by default", async () => {
    await openDialog();
    const checkboxes = screen.getAllByRole("checkbox");
    const viewCheckboxes = checkboxes.filter((cb) =>
      ["calendar", "calendrier", "archives", "tags"].some((label) =>
        cb.closest("label")?.textContent?.toLowerCase().includes(label),
      ),
    );
    expect(viewCheckboxes).toHaveLength(3);
    for (const cb of viewCheckboxes) {
      expect(cb).toBeChecked();
    }
  });

  it("calls setCalendarVisible(repo, false) when Calendar checkbox is unchecked", async () => {
    const setCalendarVisible = vi.fn();
    useSettingsStore.setState({ calendarVisible: true, setCalendarVisible });
    const user = await openDialog();
    const calendarLabel = screen.getByText(/^(Calendar|Calendrier)$/i);
    await user.click(calendarLabel);
    expect(setCalendarVisible).toHaveBeenCalledWith(getRepository(), false);
  });

  it("calls setArchivesVisible(repo, false) when Archives checkbox is unchecked", async () => {
    const setArchivesVisible = vi.fn();
    useSettingsStore.setState({ archivesVisible: true, setArchivesVisible });
    const user = await openDialog();
    const archivesLabel = screen.getByText(/^Archives$/i);
    await user.click(archivesLabel);
    expect(setArchivesVisible).toHaveBeenCalledWith(getRepository(), false);
  });

  it("calls setTagsVisible(repo, false) when Tags checkbox is unchecked", async () => {
    const setTagsVisible = vi.fn();
    useSettingsStore.setState({ tagsVisible: true, setTagsVisible });
    const user = await openDialog();
    const tagsLabel = screen.getByText(/^Tags$/i);
    await user.click(tagsLabel);
    expect(setTagsVisible).toHaveBeenCalledWith(getRepository(), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:run src/test/SidebarViewsSettings.test.tsx
```

Expected: FAIL — section heading not found.

- [ ] **Step 3: Add the section to `SettingsDialog.tsx`**

In `SettingsDialog`, add three new store reads after the existing `setGlassmorphismEnabled` line:

```tsx
const calendarVisible = useSettingsStore((s) => s.calendarVisible);
const archivesVisible = useSettingsStore((s) => s.archivesVisible);
const tagsVisible = useSettingsStore((s) => s.tagsVisible);
const setCalendarVisible = useSettingsStore((s) => s.setCalendarVisible);
const setArchivesVisible = useSettingsStore((s) => s.setArchivesVisible);
const setTagsVisible = useSettingsStore((s) => s.setTagsVisible);
```

In the JSX, in the **right column** (`{/* Right column: Notifications */}`), insert the following block **before** the existing `<div className="flex flex-col gap-3">` that contains Notifications, with a divider after:

```tsx
{/* Section: Sidebar views */}
<div className="flex flex-col gap-3">
  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
    {t("settings.sidebarViews")}
  </p>
  {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox which renders a native input */}
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <Checkbox
      checked={calendarVisible}
      onCheckedChange={(v) =>
        setCalendarVisible(getRepository(), v === true)
      }
    />
    <span className="text-sm">{t("nav.calendar")}</span>
  </label>
  {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox which renders a native input */}
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <Checkbox
      checked={archivesVisible}
      onCheckedChange={(v) =>
        setArchivesVisible(getRepository(), v === true)
      }
    />
    <span className="text-sm">{t("nav.archives")}</span>
  </label>
  {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox which renders a native input */}
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <Checkbox
      checked={tagsVisible}
      onCheckedChange={(v) =>
        setTagsVisible(getRepository(), v === true)
      }
    />
    <span className="text-sm">{t("nav.tags")}</span>
  </label>
</div>

<div className="h-px bg-border" />
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:run src/test/SidebarViewsSettings.test.tsx
```

Expected: all 5 tests PASS.

---

### Task 4: Sidebar — Conditional rendering + redirect

**Files:**

- Modify: `src/components/layout/Sidebar.tsx`
- Create: `src/test/Sidebar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/test/Sidebar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import "@/i18n";
import { Sidebar } from "@/components/layout/Sidebar";
import { useProjectStore } from "@/store/projects";
import { useTaskStore } from "@/store/tasks";
import { useSettingsStore } from "@/store/settings";
import { useUIStore } from "@/store/ui";
import { vi } from "vitest";

vi.mock("@/store/repository", () => ({
  getRepository: vi.fn(() => ({
    setSetting: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({}),
  })),
}));

const mockSetSelectedProject = vi.fn();

function setupStores({
  calendarVisible = true,
  archivesVisible = true,
  tagsVisible = true,
  selectedProjectId = undefined as string | undefined,
} = {}) {
  useProjectStore.setState({ projects: [] });
  useTaskStore.setState({ allCount: 0, todayCount: 0 });
  useSettingsStore.setState({ calendarVisible, archivesVisible, tagsVisible });
  useUIStore.setState({
    sidebarCollapsed: false,
    selectedProjectId,
    setSelectedProject: mockSetSelectedProject,
    setSidebarCollapsed: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupStores();
});

describe("Sidebar — view visibility", () => {
  it("renders Calendar nav item when calendarVisible is true", () => {
    setupStores({ calendarVisible: true });
    render(<Sidebar />);
    expect(
      screen.getByRole("button", { name: /calendar|calendrier/i }),
    ).toBeInTheDocument();
  });

  it("hides Calendar nav item when calendarVisible is false", () => {
    setupStores({ calendarVisible: false });
    render(<Sidebar />);
    expect(
      screen.queryByRole("button", { name: /^(calendar|calendrier)$/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Archives nav item when archivesVisible is false", () => {
    setupStores({ archivesVisible: false });
    render(<Sidebar />);
    expect(
      screen.queryByRole("button", { name: /^archives$/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Tags nav item when tagsVisible is false", () => {
    setupStores({ tagsVisible: false });
    render(<Sidebar />);
    expect(
      screen.queryByRole("button", { name: /^tags$/i }),
    ).not.toBeInTheDocument();
  });
});

describe("Sidebar — redirect on active view hidden", () => {
  it("calls setSelectedProject(undefined) when active view is Calendar and calendarVisible becomes false", async () => {
    setupStores({ calendarVisible: true, selectedProjectId: "calendar" });
    render(<Sidebar />);

    await act(async () => {
      useSettingsStore.setState({ calendarVisible: false });
    });

    expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
  });

  it("calls setSelectedProject(undefined) when active view is Archives and archivesVisible becomes false", async () => {
    setupStores({ archivesVisible: true, selectedProjectId: "archives" });
    render(<Sidebar />);

    await act(async () => {
      useSettingsStore.setState({ archivesVisible: false });
    });

    expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
  });

  it("calls setSelectedProject(undefined) when active view is Tags and tagsVisible becomes false", async () => {
    setupStores({ tagsVisible: true, selectedProjectId: "tags" });
    render(<Sidebar />);

    await act(async () => {
      useSettingsStore.setState({ tagsVisible: false });
    });

    expect(mockSetSelectedProject).toHaveBeenCalledWith(undefined);
  });

  it("does NOT redirect when active view is Today (always visible)", async () => {
    setupStores({ calendarVisible: false, selectedProjectId: "today" });
    render(<Sidebar />);
    expect(mockSetSelectedProject).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:run src/test/Sidebar.test.tsx
```

Expected: FAIL — Calendar/Archives/Tags always render regardless of the visibility flags.

- [ ] **Step 3: Update `Sidebar.tsx`**

Add store reads at the top of the `Sidebar` function, after the existing store reads:

```tsx
const calendarVisible = useSettingsStore((s) => s.calendarVisible);
const archivesVisible = useSettingsStore((s) => s.archivesVisible);
const tagsVisible = useSettingsStore((s) => s.tagsVisible);
```

Add the redirect effect after the existing state reads (before the `return`):

```tsx
useEffect(() => {
  if (
    (selectedProjectId === "calendar" && !calendarVisible) ||
    (selectedProjectId === "archives" && !archivesVisible) ||
    (selectedProjectId === "tags" && !tagsVisible)
  ) {
    setSelectedProject(undefined);
  }
}, [
  selectedProjectId,
  calendarVisible,
  archivesVisible,
  tagsVisible,
  setSelectedProject,
]);
```

Wrap the Tags NavItem with a conditional:

```tsx
{
  tagsVisible && (
    <NavItem
      icon={<Tags className="h-4 w-4" />}
      label={t("nav.tags")}
      active={selectedProjectId === "tags"}
      collapsed={sidebarCollapsed}
      onClick={() => setSelectedProject("tags")}
    />
  );
}
```

Wrap the Calendar NavItem:

```tsx
{
  calendarVisible && (
    <NavItem
      icon={<CalendarDays className="h-4 w-4" />}
      label={t("nav.calendar")}
      active={selectedProjectId === "calendar"}
      collapsed={sidebarCollapsed}
      onClick={() => setSelectedProject("calendar")}
    />
  );
}
```

Wrap the Archives NavItem:

```tsx
{
  archivesVisible && (
    <NavItem
      icon={<ArchiveX className="h-4 w-4" />}
      label={t("nav.archives")}
      active={selectedProjectId === "archives"}
      collapsed={sidebarCollapsed}
      onClick={() => setSelectedProject("archives")}
    />
  );
}
```

Also add `useSettingsStore` to the imports at the top of `Sidebar.tsx`:

```tsx
import { useSettingsStore } from "@/store/settings";
```

And add `useEffect` to the React import:

```tsx
import { useEffect, useState } from "react";
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test:run
```

Expected: all tests PASS with no regressions.
