import { type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Plus, ChevronUp, ChevronDown, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeMode } from "@/theme/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsStore, type NotificationTime } from "@/store/settings";
import { getRepository } from "@/store/repository";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  readonly children: ReactElement;
}

interface TimeSlotRowProps {
  readonly slot: NotificationTime;
  readonly onUpdate: (updated: NotificationTime) => void;
  readonly onRemove: () => void;
  readonly removeLabel: string;
  readonly toggleLabel: string;
}

function TimeSlotRow({ slot, onUpdate, onRemove, removeLabel, toggleLabel }: TimeSlotRowProps) {
  const isEnabled = slot.enabled !== false;

  function adj(field: "hour" | "minute", delta: number) {
    if (field === "hour") onUpdate({ ...slot, hour: (slot.hour + delta + 24) % 24 });
    else onUpdate({ ...slot, minute: (slot.minute + delta + 60) % 60 });
  }

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={isEnabled}
        onCheckedChange={(checked) => onUpdate({ ...slot, enabled: checked === true })}
        aria-label={toggleLabel}
      />
      <div className={cn("flex items-center rounded-lg border border-input bg-transparent px-1.5 py-0.5 dark:bg-input/30 gap-0.5 transition-opacity", !isEnabled && "opacity-40")}>
        {/* Hour segment */}
        <div className="group/h flex flex-col items-center">
          <button
            type="button"
            onClick={() => adj("hour", 1)}
            className="h-4 w-5 flex items-center justify-center opacity-0 group-hover/h:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <span className="font-mono text-sm leading-snug w-5 text-center select-none">
            {String(slot.hour).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={() => adj("hour", -1)}
            className="h-4 w-5 flex items-center justify-center opacity-0 group-hover/h:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <span className="text-muted-foreground text-sm font-mono leading-none self-center">:</span>

        {/* Minute segment */}
        <div className="group/m flex flex-col items-center">
          <button
            type="button"
            onClick={() => adj("minute", 5)}
            className="h-4 w-5 flex items-center justify-center opacity-0 group-hover/m:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <span className="font-mono text-sm leading-snug w-5 text-center select-none">
            {String(slot.minute).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={() => adj("minute", -5)}
            className="h-4 w-5 flex items-center justify-center opacity-0 group-hover/m:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

const THEME_MODES: { mode: ThemeMode; icon: React.ElementType; labelKey: "theme.light" | "theme.dark" | "theme.system" }[] = [
  { mode: "light", icon: Sun, labelKey: "theme.light" },
  { mode: "dark", icon: Moon, labelKey: "theme.dark" },
  { mode: "system", icon: Monitor, labelKey: "theme.system" },
];

export function SettingsDialog({ children }: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const currentLang = i18n.language.startsWith("fr") ? "fr" : "en";
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const notificationTimes = useSettingsStore((s) => s.notificationTimes);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setNotificationTimes = useSettingsStore((s) => s.setNotificationTimes);

  function handleToggleEnabled(checked: boolean) {
    setNotificationsEnabled(getRepository(), checked);
  }

  function handleUpdateTime(index: number, updated: NotificationTime) {
    const isDuplicate = notificationTimes.some(
      (t, i) => i !== index && t.hour === updated.hour && t.minute === updated.minute
    );
    if (isDuplicate) return;
    const next = notificationTimes.map((t, i) => (i === index ? updated : t));
    setNotificationTimes(getRepository(), next);
  }

  function handleRemoveTime(index: number) {
    const next = notificationTimes.filter((_, i) => i !== index);
    setNotificationTimes(getRepository(), next);
  }

  function handleAddTime() {
    const usedHours = new Set(notificationTimes.map((t) => t.hour));
    const freeHour = Array.from({ length: 24 }, (_, i) => i).find((h) => !usedHours.has(h));
    if (freeHour === undefined) return; // all 24 hours used
    setNotificationTimes(getRepository(), [...notificationTimes, { hour: freeHour, minute: 0 }]);
  }

  return (
    <Dialog>
      <DialogTrigger render={children} />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Section: Appearance */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("settings.appearance")}
            </p>
            <div className="flex gap-1">
              {THEME_MODES.map(({ mode, icon: Icon, labelKey }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setThemeMode(mode)}
                  aria-label={t(labelKey)}
                  aria-pressed={themeMode === mode}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors",
                    themeMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground border border-input"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Language */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("settings.language")}
            </p>
            <div className="flex gap-1">
              {(["fr", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => i18n.changeLanguage(lang)}
                  aria-label={lang === "fr" ? "Français" : "English"}
                  aria-pressed={currentLang === lang}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-xs font-medium uppercase transition-colors",
                    currentLang === lang
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground border border-input"
                  )}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Notifications */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("settings.notifications")}
            </p>

            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <Checkbox
                checked={notificationsEnabled}
                onCheckedChange={handleToggleEnabled}
              />
              <span className="text-sm">{t("settings.enableNotifications")}</span>
            </label>

            {/* Time slots */}
            <div className={cn("flex flex-col gap-2", !notificationsEnabled && "pointer-events-none opacity-40")}>
              <p className="text-xs text-muted-foreground">{t("settings.notificationTimes")}</p>

              {notificationTimes.map((slot, i) => (
                <TimeSlotRow
                  key={`${slot.hour}:${slot.minute}`}
                  slot={slot}
                  onUpdate={(updated) => handleUpdateTime(i, updated)}
                  onRemove={() => handleRemoveTime(i)}
                  removeLabel={t("settings.removeTime")}
                  toggleLabel={t("settings.toggleTime")}
                />
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="w-fit text-muted-foreground"
                onClick={handleAddTime}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("settings.addTime")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
