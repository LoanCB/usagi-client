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

const mockRepo = {
	setSetting: vi.fn().mockResolvedValue(undefined),
	getSettings: vi.fn().mockResolvedValue({}),
};

beforeEach(() => {
	vi.clearAllMocks();
	useSettingsStore.setState({
		glassmorphismEnabled: false,
		calendarVisible: true,
		archivesVisible: true,
		tagsVisible: true,
	});
});

describe("useSettingsStore glassmorphism", () => {
	it("defaults glassmorphismEnabled to false", () => {
		expect(useSettingsStore.getState().glassmorphismEnabled).toBe(false);
	});

	it("setGlassmorphismEnabled updates state and persists", async () => {
		await useSettingsStore
			.getState()
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			.setGlassmorphismEnabled(mockRepo as any, true);
		expect(useSettingsStore.getState().glassmorphismEnabled).toBe(true);
		expect(mockRepo.setSetting).toHaveBeenCalledWith(
			"glassmorphism_enabled",
			"true",
		);
	});

	it("loadSettings restores glassmorphismEnabled from persisted value", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({
			glassmorphism_enabled: "true",
		});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().glassmorphismEnabled).toBe(true);
	});
});

describe("useSettingsStore notifications and parallax", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSettingsStore.setState({
			notificationsEnabled: true,
			notificationTimes: [
				{ hour: 10, minute: 0 },
				{ hour: 14, minute: 0 },
			],
			parallaxEnabled: true,
			glassmorphismEnabled: false,
		});
	});

	it("loadSettings sets notificationsEnabled to false when stored as 'false'", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({
			notification_enabled: "false",
		});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
	});

	it("loadSettings defaults notificationsEnabled to true when key is absent", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
	});

	it("loadSettings restores notificationTimes from JSON", async () => {
		const times = [{ hour: 9, minute: 30 }];
		mockRepo.getSettings.mockResolvedValueOnce({
			notification_times: JSON.stringify(times),
		});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationTimes).toEqual(times);
	});

	it("loadSettings uses default notificationTimes when key is absent", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().notificationTimes).toEqual([
			{ hour: 10, minute: 0 },
			{ hour: 14, minute: 0 },
		]);
	});

	it("loadSettings sets parallaxEnabled to false when stored as 'false'", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({ parallax_enabled: "false" });
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().parallaxEnabled).toBe(false);
	});

	it("loadSettings defaults parallaxEnabled to true when key is absent", async () => {
		mockRepo.getSettings.mockResolvedValueOnce({});
		// biome-ignore lint/suspicious/noExplicitAny: partial mock
		await useSettingsStore.getState().loadSettings(mockRepo as any);
		expect(useSettingsStore.getState().parallaxEnabled).toBe(true);
	});

	it("setNotificationsEnabled updates state and calls setSetting", async () => {
		await useSettingsStore
			.getState()
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			.setNotificationsEnabled(mockRepo as any, false);
		expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
		expect(mockRepo.setSetting).toHaveBeenCalledWith(
			"notification_enabled",
			"false",
		);
	});

	it("setNotificationTimes updates state and serialises times to JSON", async () => {
		const times = [{ hour: 8, minute: 0, enabled: true }];
		await useSettingsStore
			.getState()
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			.setNotificationTimes(mockRepo as any, times);
		expect(useSettingsStore.getState().notificationTimes).toEqual(times);
		expect(mockRepo.setSetting).toHaveBeenCalledWith(
			"notification_times",
			JSON.stringify(times),
		);
	});

	it("setParallaxEnabled updates state and calls setSetting", async () => {
		await useSettingsStore
			.getState()
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			.setParallaxEnabled(mockRepo as any, false);
		expect(useSettingsStore.getState().parallaxEnabled).toBe(false);
		expect(mockRepo.setSetting).toHaveBeenCalledWith(
			"parallax_enabled",
			"false",
		);
	});
});

describe("loadSettings — view visibility", () => {
	beforeEach(() => {
		useSettingsStore.setState({
			calendarVisible: true,
			archivesVisible: true,
			tagsVisible: true,
		});
	});

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
