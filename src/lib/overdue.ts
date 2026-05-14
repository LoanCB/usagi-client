import type { Task } from "@/types";

export function getOverdueTasks(tasks: Task[]): Task[] {
	const today = new Date().toISOString().slice(0, 10);
	return tasks.filter(
		(t) => t.completedAt === null && t.dueDate !== null && t.dueDate < today,
	);
}
