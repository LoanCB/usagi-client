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
  loadSettings(repo: TodoRepository): Promise<void>;
  setNotificationsEnabled(repo: TodoRepository, enabled: boolean): Promise<void>;
  setNotificationTimes(repo: TodoRepository, times: NotificationTime[]): Promise<void>;
  setParallaxEnabled(repo: TodoRepository, enabled: boolean): Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  notificationsEnabled: true,
  notificationTimes: [
    { hour: 10, minute: 0 },
    { hour: 14, minute: 0 },
  ],
  parallaxEnabled: true,

  async loadSettings(repo) {
    const raw = await repo.getSettings();
    const notificationsEnabled = raw["notification_enabled"] !== "false";
    const notificationTimes: NotificationTime[] = raw["notification_times"]
      ? (JSON.parse(raw["notification_times"]) as NotificationTime[])
      : [{ hour: 10, minute: 0 }, { hour: 14, minute: 0 }];
    const parallaxEnabled = raw["parallax_enabled"] !== "false";
    set({ notificationsEnabled, notificationTimes, parallaxEnabled });
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
}));
