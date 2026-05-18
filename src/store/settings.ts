import { create } from "zustand";
import type { TodoRepository } from "@/db/repository";

export interface NotificationTime {
	hour: number;
	minute: number;
	enabled?: boolean; // undefined treated as true (backwards-compatible)
}

interface SettingsStore {
	notificationsEnabled: boolean;
	notificationTimes: NotificationTime[];
	parallaxEnabled: boolean;
	glassmorphismEnabled: boolean;
	calendarVisible: boolean;
	archivesVisible: boolean;
	tagsVisible: boolean;
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
}

export const useSettingsStore = create<SettingsStore>((set) => ({
	notificationsEnabled: true,
	notificationTimes: [
		{ hour: 10, minute: 0 },
		{ hour: 14, minute: 0 },
	],
	parallaxEnabled: true,
	glassmorphismEnabled: false,
	calendarVisible: true,
	archivesVisible: true,
	tagsVisible: true,

	async loadSettings(repo) {
		const raw = await repo.getSettings();
		const notificationsEnabled = raw.notification_enabled !== "false";
		const notificationTimes: NotificationTime[] = raw.notification_times
			? (JSON.parse(raw.notification_times) as NotificationTime[])
			: [
					{ hour: 10, minute: 0 },
					{ hour: 14, minute: 0 },
				];
		const parallaxEnabled = raw.parallax_enabled !== "false";
		const glassmorphismEnabled = raw.glassmorphism_enabled === "true";
		const calendarVisible = raw.calendar_visible !== "false";
		const archivesVisible = raw.archives_visible !== "false";
		const tagsVisible = raw.tags_visible !== "false";
		set({
			notificationsEnabled,
			notificationTimes,
			parallaxEnabled,
			glassmorphismEnabled,
			calendarVisible,
			archivesVisible,
			tagsVisible,
		});
	},

	async setNotificationsEnabled(repo, enabled) {
		await repo.setSetting("notification_enabled", String(enabled));
		set({ notificationsEnabled: enabled });
	},

	async setNotificationTimes(repo, times) {
		await repo.setSetting("notification_times", JSON.stringify(times));
		set({ notificationTimes: times });
	},

	async setParallaxEnabled(repo, enabled) {
		await repo.setSetting("parallax_enabled", String(enabled));
		set({ parallaxEnabled: enabled });
	},

	async setGlassmorphismEnabled(repo, enabled) {
		await repo.setSetting("glassmorphism_enabled", String(enabled));
		set({ glassmorphismEnabled: enabled });
	},

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
}));
