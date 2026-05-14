import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "./settings";

const mockRepo = {
	setSetting: vi.fn().mockResolvedValue(undefined),
	getSettings: vi.fn().mockResolvedValue({}),
};

beforeEach(() => {
	vi.clearAllMocks();
	useSettingsStore.setState({ glassmorphismEnabled: false });
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
