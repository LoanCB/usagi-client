import { Sidebar } from "./Sidebar";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";
import { useUIStore } from "@/store/ui";

export function AppShell() {
  const selectedTaskId = useUIStore((s) => s.selectedTaskId);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <TaskList />
      {selectedTaskId && <TaskDetail />}
    </div>
  );
}
