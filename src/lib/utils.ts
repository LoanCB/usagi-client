import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format ISO date string to locale-friendly short date ("Apr 12")
export function formatDate(isoDate: string, locale?: string): string {
  return new Date(isoDate).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

// Returns true if the ISO date is strictly before today (past due)
export function isOverdue(isoDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(isoDate) < today;
}

// Today's date as ISO date string ("2026-04-10")
export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}
