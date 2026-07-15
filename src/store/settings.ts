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
	searchTriggerVisible: boolean;
	colorblindMode: boolean;
	quickAddPriorityVisible: boolean;
	quickAddDueDateVisible: boolean;
	quickAddTagsVisible: boolean;
	priorityBackgroundVisible: boolean;
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
	setSearchTriggerVisible(
		repo: TodoRepository,
		visible: boolean,
	): Promise<void>;
	setColorblindMode(repo: TodoRepository, enabled: boolean): Promise<void>;
	setQuickAddPriorityVisible(
		repo: TodoRepository,
		visible: boolean,
	): Promise<void>;
	setQuickAddDueDateVisible(
		repo: TodoRepository,
		visible: boolean,
	): Promise<void>;
	setQuickAddTagsVisible(repo: TodoRepository, visible: boolean): Promise<void>;
	setPriorityBackgroundVisible(
		repo: TodoRepository,
		visible: boolean,
	): Promise<void>;
	betaChannel: boolean;
	setBetaChannel(repo: TodoRepository, enabled: boolean): Promise<void>;
	// Latest changelog version the user has been shown (null until first launch).
	lastSeenChangelogVersion: string | null;
	setLastSeenChangelogVersion(
		repo: TodoRepository,
		version: string,
	): Promise<void>;
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
	searchTriggerVisible: true,
	colorblindMode: false,
	quickAddPriorityVisible: false,
	quickAddDueDateVisible: false,
	quickAddTagsVisible: true,
	priorityBackgroundVisible: false,
	betaChannel: false,
	lastSeenChangelogVersion: null,

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
		const searchTriggerVisible = raw.search_trigger_visible !== "false";
		const colorblindMode = raw.colorblind_mode === "true";
		const quickAddPriorityVisible = raw.quick_add_priority_visible === "true";
		const quickAddDueDateVisible = raw.quick_add_due_date_visible === "true";
		const quickAddTagsVisible = raw.quick_add_tags_visible !== "false";
		const priorityBackgroundVisible =
			raw.priority_background_visible === "true";
		const betaChannel = raw.beta_channel === "true";
		const lastSeenChangelogVersion = raw.last_seen_changelog_version ?? null;
		set({
			notificationsEnabled,
			notificationTimes,
			parallaxEnabled,
			glassmorphismEnabled,
			calendarVisible,
			archivesVisible,
			tagsVisible,
			searchTriggerVisible,
			colorblindMode,
			quickAddPriorityVisible,
			quickAddDueDateVisible,
			quickAddTagsVisible,
			priorityBackgroundVisible,
			betaChannel,
			lastSeenChangelogVersion,
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

	async setSearchTriggerVisible(repo, visible) {
		await repo.setSetting("search_trigger_visible", String(visible));
		set({ searchTriggerVisible: visible });
	},

	async setColorblindMode(repo, enabled) {
		await repo.setSetting("colorblind_mode", String(enabled));
		set({ colorblindMode: enabled });
	},

	async setQuickAddPriorityVisible(repo, visible) {
		await repo.setSetting("quick_add_priority_visible", String(visible));
		set({ quickAddPriorityVisible: visible });
	},

	async setQuickAddDueDateVisible(repo, visible) {
		await repo.setSetting("quick_add_due_date_visible", String(visible));
		set({ quickAddDueDateVisible: visible });
	},

	async setQuickAddTagsVisible(repo, visible) {
		await repo.setSetting("quick_add_tags_visible", String(visible));
		set({ quickAddTagsVisible: visible });
	},

	async setPriorityBackgroundVisible(repo, visible) {
		await repo.setSetting("priority_background_visible", String(visible));
		set({ priorityBackgroundVisible: visible });
	},

	async setBetaChannel(repo, enabled) {
		await repo.setSetting("beta_channel", String(enabled));
		set({ betaChannel: enabled });
	},

	async setLastSeenChangelogVersion(repo, version) {
		await repo.setSetting("last_seen_changelog_version", version);
		set({ lastSeenChangelogVersion: version });
	},
}));
