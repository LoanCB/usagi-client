import type { Task } from "@/types";

export function groupTasksByDate(
  tasks: Task[],
): Map<string, { due: Task[]; completed: Task[] }> {
  const map = new Map<string, { due: Task[]; completed: Task[] }>();

  function getOrCreate(date: string) {
    if (!map.has(date)) map.set(date, { due: [], completed: [] });
    const entry = map.get(date);
    if (!entry) throw new Error("unreachable");
    return entry;
  }

  for (const task of tasks) {
    if (task.completedAt) {
      getOrCreate(task.completedAt.slice(0, 10)).completed.push(task);
    } else if (task.dueDate) {
      getOrCreate(task.dueDate).due.push(task);
    }
  }

  return map;
}
