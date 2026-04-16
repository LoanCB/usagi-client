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
  loadSettings(repo: TodoRepository): Promise<void>;
  setNotificationsEnabled(repo: TodoRepository, enabled: boolean): Promise<void>;
  setNotificationTimes(repo: TodoRepository, times: NotificationTime[]): Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  notificationsEnabled: true,
  notificationTimes: [
    { hour: 10, minute: 0 },
    { hour: 14, minute: 0 },
  ],

  async loadSettings(repo) {
    const raw = await repo.getSettings();
    const notificationsEnabled = raw["notification_enabled"] !== "false";
    const notificationTimes: NotificationTime[] = raw["notification_times"]
      ? (JSON.parse(raw["notification_times"]) as NotificationTime[])
      : [{ hour: 10, minute: 0 }, { hour: 14, minute: 0 }];
    set({ notificationsEnabled, notificationTimes });
  },

  async setNotificationsEnabled(repo, enabled) {
    await repo.setSetting("notification_enabled", String(enabled));
    set({ notificationsEnabled: enabled });
  },

  async setNotificationTimes(repo, times) {
    await repo.setSetting("notification_times", JSON.stringify(times));
    set({ notificationTimes: times });
  },
}));
