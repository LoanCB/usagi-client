# Colorblind Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in colorblind mode that replaces the priority dot in each task row with a 3-bar intensity indicator, toggled from the Settings > Appearance section.

**Architecture:** New boolean `colorblindMode` added to the settings Zustand store (persisted to DB as `colorblind_mode`). `TaskItem` reads the setting and renders either the existing dot or three vertical bars depending on the value. Background tint and border colors on the card are unchanged. A Switch row is added to `SettingsDialog` below the "Background animation" toggle.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest + Testing Library, i18next

---

### Task 1: Add `colorblindMode` to the settings store (TDD)

**Files:**
- Modify: `src/store/settings.ts`
- Test: `src/store/settings.test.ts`

- [ ] **Step 1: Add failing tests at the bottom of `src/store/settings.test.ts`**

Append a new describe block after all existing tests:

```ts
describe("useSettingsStore colorblindMode", () => {
	it("defaults colorblindMode to false", () => {
		expect(useSettingsStore.getState().colorblindMode).toBe(false);
	});

	it("setColorblindMode updates state and persists to DB", async () => {
		await useSettingsStore
			.getState()
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			.setColorblindMode(mockRepo as any, true);
		expect(useSettingsStore.getState().colorblindMode).toBe(true);
		expect(mockRepo.setSetting).toHaveBeenCalledWith(
			"colorblind_mode",
			"true",
		);
	});

	it("loadSettings restores colorblindMode from persisted value", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({
			colorblind_mode: "true",
		});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().colorblindMode).toBe(true);
	});

	it("loadSettings defaults colorblindMode to false when key is absent", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().colorblindMode).toBe(false);
	});
});
```

Also add `colorblindMode: false` to the global `beforeEach` `setState` call (lines 36–42) so the new tests don't bleed into each other:

```ts
beforeEach(() => {
	vi.clearAllMocks();
	useSettingsStore.setState({
		glassmorphismEnabled: false,
		calendarVisible: true,
		archivesVisible: true,
		tagsVisible: true,
		colorblindMode: false,
	});
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: 4 new failures — `colorblindMode` is not defined.

- [ ] **Step 3: Add `colorblindMode` to the `SettingsStore` interface in `src/store/settings.ts`**

Add two lines to the interface (after `tagsVisible: boolean;` on line 17, and after `setTagsVisible` on line 34):

```ts
interface SettingsStore {
	notificationsEnabled: boolean;
	notificationTimes: NotificationTime[];
	parallaxEnabled: boolean;
	glassmorphismEnabled: boolean;
	calendarVisible: boolean;
	archivesVisible: boolean;
	tagsVisible: boolean;
	colorblindMode: boolean;
	loadSettings(repo: TodoRepository): Promise<void>;
	setNotificationsEnabled(
		repo: TodoRepository,
		enabled: boolean,
	): Promise<void>;
	setNotificationTimes(
		repo: TodoRepository,
		times: NotificationTime[],
	): Promise<void>;
	setParallaxEnabled(repo: TodoRepository, enabled: boolean): Promise<void>;
	setGlassmorphismEnabled(
		repo: TodoRepository,
		enabled: boolean,
	): Promise<void>;
	setCalendarVisible(repo: TodoRepository, visible: boolean): Promise<void>;
	setArchivesVisible(repo: TodoRepository, visible: boolean): Promise<void>;
	setTagsVisible(repo: TodoRepository, visible: boolean): Promise<void>;
	setColorblindMode(repo: TodoRepository, enabled: boolean): Promise<void>;
}
```

- [ ] **Step 4: Add initial state, `loadSettings` read, and setter to the store body**

In `useSettingsStore`, add `colorblindMode: false` to the initial state (after `tagsVisible: true,` on line 47):

```ts
	tagsVisible: true,
	colorblindMode: false,
```

In `loadSettings`, add the read after `const tagsVisible = raw.tags_visible !== "false";` (line 62):

```ts
		const colorblindMode = raw.colorblind_mode === "true";
```

Add `colorblindMode` to the `set({...})` call:

```ts
		set({
			notificationsEnabled,
			notificationTimes,
			parallaxEnabled,
			glassmorphismEnabled,
			calendarVisible,
			archivesVisible,
			tagsVisible,
			colorblindMode,
		});
```

Add the setter after `setTagsVisible` (before the closing `}`):

```ts
	async setColorblindMode(repo, enabled) {
		await repo.setSetting("colorblind_mode", String(enabled));
		set({ colorblindMode: enabled });
	},
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm test:run src/store/settings.test.ts
```

Expected: all tests pass (previous tests + 4 new ones).

---

### Task 2: Add i18n keys for both locales

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1: Add English key after `glassmorphism` (line 179 of `en.ts`)**

```ts
		parallax: "Background animation",
		glassmorphism: "Glassmorphism",
		colorblindMode: "Colorblind mode",
```

- [ ] **Step 2: Add French key after `glassmorphism` (line 181 of `fr.ts`)**

```ts
		parallax: "Animation du fond",
		glassmorphism: "Glassmorphisme",
		colorblindMode: "Mode daltonien",
```

- [ ] **Step 3: Run lint to verify no type errors**

```bash
pnpm lint
```

Expected: no errors.

---

### Task 3: Add the toggle to SettingsDialog

**Files:**
- Modify: `src/components/layout/SettingsDialog.tsx`

- [ ] **Step 1: Add store subscriptions after `setGlassmorphismEnabled` (after line 368)**

```tsx
	const glassmorphismEnabled = useSettingsStore((s) => s.glassmorphismEnabled);
	const setGlassmorphismEnabled = useSettingsStore(
		(s) => s.setGlassmorphismEnabled,
	);
	const colorblindMode = useSettingsStore((s) => s.colorblindMode);
	const setColorblindMode = useSettingsStore((s) => s.setColorblindMode);
```

- [ ] **Step 2: Add the Switch row in the JSX after the parallax toggle closing `</div>` (after line 628)**

The parallax toggle block ends with:
```tsx
								</div>
							</div>

							<div className="h-px bg-border" />
```

Insert the new row between the closing `</div>` of the parallax block and the `<div className="h-px bg-border" />` separator:

```tsx
								</div>
								<div className="flex items-center justify-between cursor-pointer select-none">
									<span className="text-sm text-foreground">
										{t("settings.colorblindMode")}
									</span>
									<Switch
										checked={colorblindMode}
										onCheckedChange={(v) =>
											setColorblindMode(getRepository(), v)
										}
									/>
								</div>
							</div>

							<div className="h-px bg-border" />
```

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: no errors.

---

### Task 4: Add `PRIORITY_BARS_GLOW` and conditional rendering in TaskItem (TDD)

**Files:**
- Modify: `src/test/TaskItem.test.tsx`
- Modify: `src/components/tasks/TaskItem.tsx`

- [ ] **Step 1: Add `useSettingsStore` import and `beforeEach` reset to the test file**

Add to existing imports at the top of `src/test/TaskItem.test.tsx`:

```tsx
import { useSettingsStore } from "@/store/settings";
```

Add `useSettingsStore.setState({ colorblindMode: false });` to the existing `beforeEach`:

```tsx
beforeEach(() => {
	vi.clearAllMocks();
	writeTextSpy = vi
		.spyOn(navigator.clipboard, "writeText")
		.mockResolvedValue(undefined);
	useTaskStore.setState({ allCount: 0, todayCount: 0 });
	useTagStore.setState({ tags: [] });
	useUIStore.setState({
		selectedTaskId: null,
		setSelectedTask: vi.fn(),
		sidebarCollapsed: false,
		setSidebarCollapsed: vi.fn(),
	});
	useSettingsStore.setState({ colorblindMode: false });
});
```

- [ ] **Step 2: Add failing tests for colorblind rendering at the bottom of the `describe("TaskItem")` block**

```tsx
	describe("colorblind mode", () => {
		it("renders priority bars instead of dot when colorblind mode is on", () => {
			useSettingsStore.setState({ colorblindMode: true });
			render(
				<TaskItem
					task={{ ...mockTask, priority: "high" }}
					onDeleteRequest={vi.fn()}
				/>,
			);
			expect(screen.getByTestId("priority-bars")).toBeInTheDocument();
			expect(screen.queryByTestId("priority-dot")).not.toBeInTheDocument();
		});

		it("renders no bars for none priority in colorblind mode", () => {
			useSettingsStore.setState({ colorblindMode: true });
			render(<TaskItem task={mockTask} onDeleteRequest={vi.fn()} />);
			expect(screen.queryByTestId("priority-bars")).not.toBeInTheDocument();
		});

		it("renders dot (not bars) when colorblind mode is off", () => {
			render(
				<TaskItem
					task={{ ...mockTask, priority: "high" }}
					onDeleteRequest={vi.fn()}
				/>,
			);
			expect(screen.getByTestId("priority-dot")).toBeInTheDocument();
			expect(screen.queryByTestId("priority-bars")).not.toBeInTheDocument();
		});
	});
```

- [ ] **Step 3: Run tests to confirm new tests fail**

```bash
pnpm test:run src/test/TaskItem.test.tsx
```

Expected: 3 new failures — `priority-bars` not found / `priority-dot` still in DOM.

- [ ] **Step 4: Add `PRIORITY_BARS_GLOW` constant to `src/components/tasks/TaskItem.tsx`**

Add after the existing `PRIORITY_BORDER` constant (after line 56):

```tsx
const PRIORITY_BARS_GLOW: Record<Priority, string> = {
	high: "0 0 3px rgba(239,68,68,0.5)",
	medium: "0 0 3px rgba(234,179,8,0.45)",
	low: "0 0 3px rgba(34,197,94,0.4)",
	none: "none",
};
```

- [ ] **Step 5: Add `colorblindMode` subscription to the `TaskItem` component body**

Inside `export function TaskItem`, after the existing store subscriptions (after `useTagStore`, `useUIStore`, etc.), add:

```tsx
	const colorblindMode = useSettingsStore((s) => s.colorblindMode);
```

Also add `useSettingsStore` to the imports at the top of the file:

```tsx
import { useSettingsStore } from "@/store/settings";
```

- [ ] **Step 6: Replace the existing dot `<span>` with the conditional indicator**

Find the current dot span (added in the previous feature):

```tsx
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
								? "1.5px solid var(--border)"
								: undefined,
						marginLeft: 2,
					}}
				/>
```

Replace with:

```tsx
				<span className="shrink-0" data-testid="priority-indicator">
					{!colorblindMode ? (
						<span
							data-testid="priority-dot"
							className="rounded-full"
							style={{
								display: "block",
								width: 7,
								height: 7,
								background: PRIORITY_DOT[task.priority],
								boxShadow: PRIORITY_GLOW[task.priority],
								border:
									task.priority === "none"
										? "1.5px solid var(--border)"
										: undefined,
								marginLeft: 2,
							}}
						/>
					) : task.priority !== "none" ? (
						<span
							data-testid="priority-bars"
							style={{
								display: "flex",
								alignItems: "flex-end",
								gap: 1.5,
								height: 11,
								marginLeft: 2,
							}}
						>
							{[
								{ height: 4, active: true },
								{
									height: 7,
									active:
										task.priority === "medium" ||
										task.priority === "high",
								},
								{ height: 11, active: task.priority === "high" },
							].map((bar, i) => (
								<span
									key={i}
									style={{
										width: 3,
										height: bar.height,
										borderRadius: 1,
										background: PRIORITY_DOT[task.priority],
										opacity: bar.active ? 1 : 0.2,
										boxShadow: bar.active
											? PRIORITY_BARS_GLOW[task.priority]
											: "none",
									}}
								/>
							))}
						</span>
					) : (
						<span style={{ width: 13, display: "inline-block" }} />
					)}
				</span>
```

- [ ] **Step 7: Run TaskItem tests to confirm all pass**

```bash
pnpm test:run src/test/TaskItem.test.tsx
```

Expected: all tests pass (existing 6 + new 3 = 9 total).

---

### Task 5: Full test suite and lint

**Files:** none

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test:run
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: no errors. If biome reports an ordering issue on imports, run `pnpm lint:fix` to auto-correct.
