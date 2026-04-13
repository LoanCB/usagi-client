import { Sidebar } from "./Sidebar";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";
import { TagManager } from "@/components/tags/TagManager";
import { useUIStore } from "@/store/ui";

export function AppShell() {
  const { selectedTaskId, selectedProjectId } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      {selectedProjectId === "tags" ? <TagManager /> : <TaskList />}
      {selectedTaskId && selectedProjectId !== "tags" && <TaskDetail />}
    </div>
  );
}
