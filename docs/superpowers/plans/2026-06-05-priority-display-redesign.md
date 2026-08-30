# Priority Display Redesign — Task List

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the subtle 3px colored left border on task rows with a glowing semantic dot + tinted card background, using fixed colors (red/orange/green) that never change with the theme.

**Architecture:** Single file change — `TaskItem.tsx`. Four new constant maps replace the old `PRIORITY_BORDER_COLORS` map. A 7px dot `<span>` is inserted after `<Checkbox>`. Card background and border colors are driven by inline styles so they override the CSS class baseline while remaining fully transparent for `none` priority.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library

---

### Task 1: Add failing tests for the priority dot

**Files:**

- Modify: `src/test/TaskItem.test.tsx`

- [ ] **Step 1: Add the new tests inside the existing `describe("TaskItem")` block**

Append these tests after the existing clipboard test (before the closing `}`):

```tsx
it("renders a priority dot for each priority level", () => {
  const { rerender } = render(
    <TaskItem
      task={{ ...mockTask, priority: "high" }}
      onDeleteRequest={vi.fn()}
    />,
  );
  expect(screen.getByTestId("priority-dot")).toBeInTheDocument();

  rerender(
    <TaskItem
      task={{ ...mockTask, priority: "medium" }}
      onDeleteRequest={vi.fn()}
    />,
  );
  expect(screen.getByTestId("priority-dot")).toBeInTheDocument();

  rerender(
    <TaskItem
      task={{ ...mockTask, priority: "low" }}
      onDeleteRequest={vi.fn()}
    />,
  );
  expect(screen.getByTestId("priority-dot")).toBeInTheDocument();

  rerender(
    <TaskItem
      task={{ ...mockTask, priority: "none" }}
      onDeleteRequest={vi.fn()}
    />,
  );
  expect(screen.getByTestId("priority-dot")).toBeInTheDocument();
});

it("applies red dot color for high priority", () => {
  render(
    <TaskItem
      task={{ ...mockTask, priority: "high" }}
      onDeleteRequest={vi.fn()}
    />,
  );
  expect(screen.getByTestId("priority-dot")).toHaveStyle({
    background: "#ef4444",
  });
});

it("applies yellow dot color for medium priority", () => {
  render(
    <TaskItem
      task={{ ...mockTask, priority: "medium" }}
      onDeleteRequest={vi.fn()}
    />,
  );
  expect(screen.getByTestId("priority-dot")).toHaveStyle({
    background: "#eab308",
  });
});

it("applies green dot color for low priority", () => {
  render(
    <TaskItem
      task={{ ...mockTask, priority: "low" }}
      onDeleteRequest={vi.fn()}
    />,
  );
  expect(screen.getByTestId("priority-dot")).toHaveStyle({
    background: "#22c55e",
  });
});

it("renders transparent dot for no priority", () => {
  render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);
  expect(screen.getByTestId("priority-dot")).toHaveStyle({
    background: "transparent",
  });
});
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
pnpm test:run src/test/TaskItem.test.tsx
```

Expected output: 5 new test failures with `Unable to find an element by: [data-testid="priority-dot"]`

---

### Task 2: Replace the priority constant and update imports

**Files:**

- Modify: `src/components/tasks/TaskItem.tsx` (lines 28, 30–35)

- [ ] **Step 1: Add `Priority` to the type import on line 28**

Change:

```tsx
import type { Project, Task } from "@/types";
```

To:

```tsx
import type { Priority, Project, Task } from "@/types";
```

- [ ] **Step 2: Replace `PRIORITY_BORDER_COLORS` (lines 30–35) with four new maps**

Remove:

```tsx
const PRIORITY_BORDER_COLORS: Record<string, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
  none: "transparent",
};
```

Add in its place:

```tsx
const PRIORITY_DOT: Record<Priority, string> = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#22c55e",
  none: "transparent",
};

const PRIORITY_GLOW: Record<Priority, string> = {
  high: "0 0 5px rgba(239,68,68,0.7)",
  medium: "0 0 5px rgba(234,179,8,0.6)",
  low: "0 0 5px rgba(34,197,94,0.5)",
  none: "none",
};

const PRIORITY_BG: Record<Priority, string | undefined> = {
  high: "rgba(239,68,68,0.08)",
  medium: "rgba(234,179,8,0.07)",
  low: "rgba(34,197,94,0.06)",
  none: undefined,
};

const PRIORITY_BORDER: Record<Priority, string | undefined> = {
  high: "rgba(239,68,68,0.20)",
  medium: "rgba(234,179,8,0.18)",
  low: "rgba(34,197,94,0.15)",
  none: undefined,
};
```

---

### Task 3: Update the card's inline style object

**Files:**

- Modify: `src/components/tasks/TaskItem.tsx` (lines 65–72)

- [ ] **Step 1: Replace the `style` constant**

Remove:

```tsx
const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.45 : undefined,
  borderStyle: isDragging ? ("dashed" as const) : undefined,
  background: isDragging ? "transparent" : undefined,
  borderLeftColor: PRIORITY_BORDER_COLORS[task.priority],
};
```

Add:

```tsx
const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.45 : undefined,
  borderStyle: isDragging ? ("dashed" as const) : undefined,
  backgroundColor: isDragging ? "transparent" : PRIORITY_BG[task.priority],
  borderColor: PRIORITY_BORDER[task.priority],
};
```

---

### Task 4: Update the card className and insert the dot span

**Files:**

- Modify: `src/components/tasks/TaskItem.tsx` (lines 105–128)

- [ ] **Step 1: Remove `border-l-[3px]` from the card className**

Find:

```tsx
"rounded-xl border border-l-[3px] glass-card transition-all duration-150",
```

Change to:

```tsx
"rounded-xl border glass-card transition-all duration-150",
```

- [ ] **Step 2: Insert the dot span after `<Checkbox>`**

Find the closing of the Checkbox element:

```tsx
<Checkbox
  checked={!!task.completedAt}
  onCheckedChange={handleChecked}
  className="shrink-0"
/>
```

Add the dot span immediately after it:

```tsx
<Checkbox
  checked={!!task.completedAt}
  onCheckedChange={handleChecked}
  className="shrink-0"
/>

<span
  data-testid="priority-dot"
  className="shrink-0 rounded-full"
  style={{
    width: 7,
    height: 7,
    background: PRIORITY_DOT[task.priority],
    boxShadow: PRIORITY_GLOW[task.priority],
    border:
      task.priority === "none"
        ? "1.5px solid rgba(255,255,255,0.18)"
        : undefined,
    marginLeft: 2,
  }}
/>
```

---

### Task 5: Run tests, lint and verify

**Files:** none

- [ ] **Step 1: Run all TaskItem tests**

```bash
pnpm test:run src/test/TaskItem.test.tsx
```

Expected: 6/6 tests pass

- [ ] **Step 2: Run full test suite to check for regressions**

```bash
pnpm test:run
```

Expected: no new failures

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: no errors. If biome reports an unused import or ordering issue, run `pnpm lint:fix` to auto-correct.
