import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Task } from "@/types";
import { getOverdueTasks } from "@/lib/overdue";
import { useSettingsStore } from "@/store/settings";

const TOLERANCE_MINUTES = 2;

export function useOverdueNotifications(tasks: Task[]): void {
  const { t } = useTranslation();
  const tasksRef = useRef(tasks);
  const hasNotifiedOnLaunch = useRef(false);
  const lastFiredSlot = useRef<{ date: string; hour: number; minute: number } | null>(null);

  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const notificationTimes = useSettingsStore((s) => s.notificationTimes);

  // Keep tasksRef current so the interval always reads the latest tasks
  useEffect(() => {
    tasksRef.current = tasks;
  });

  async function dispatch(currentTasks: Task[]) {
    const overdue = getOverdueTasks(currentTasks);
    if (overdue.length === 0) return;

    let permitted = await isPermissionGranted();
    if (!permitted) {
      permitted = (await requestPermission()) === "granted";
    }
    if (!permitted) return;

    try {
      if (overdue.length > 2) {
        await invoke("send_app_notification", {
          title: t("notifications.overdueTitle"),
          body: t("notifications.overdueBody", { count: overdue.length }),
        });
      } else {
        for (const task of overdue) {
          await invoke("send_app_notification", {
            title: task.title,
            body: t("notifications.overdueTaskBody"),
          });
        }
      }
    } catch (err) {
      console.error("[notifications] send_app_notification failed:", err);
    }
  }

  // Fire once after tasks first load on launch
  useEffect(() => {
    if (!notificationsEnabled) return;
    if (tasks.length === 0 || hasNotifiedOnLaunch.current) return;
    hasNotifiedOnLaunch.current = true;
    dispatch(tasks);
  }, [tasks, notificationsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 60s; fire at each configured time (±TOLERANCE_MINUTES)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!notificationsEnabled || notificationTimes.length === 0) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const date = now.toISOString().slice(0, 10);

      for (const slot of notificationTimes) {
        if (slot.enabled === false) continue;
        if (currentHour !== slot.hour) continue;
        if (Math.abs(currentMinute - slot.minute) > TOLERANCE_MINUTES) continue;

        const last = lastFiredSlot.current;
        if (last?.date === date && last?.hour === slot.hour && last?.minute === slot.minute) continue;

        lastFiredSlot.current = { date, hour: slot.hour, minute: slot.minute };
        dispatch(tasksRef.current);
        break; // fire at most one slot per tick
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [notificationsEnabled, notificationTimes]); // eslint-disable-line react-hooks/exhaustive-deps
}
