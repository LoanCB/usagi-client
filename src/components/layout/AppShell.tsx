import { Sidebar } from "./Sidebar";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";
import { ResizeHandle } from "./ResizeHandle";
import { TagManager } from "@/components/tags/TagManager";
import { useUIStore } from "@/store/ui";
import { useResizable } from "@/hooks/useResizable";

export function AppShell() {
  const { selectedTaskId, selectedProjectId } = useUIStore();
  const { width, isDragging, onMouseDown } = useResizable({
    storageKey: "task-detail-width",
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 600,
  });

  const showDetail = selectedTaskId && selectedProjectId !== "tags";

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      {selectedProjectId === "tags" ? <TagManager /> : <TaskList />}
      {showDetail && (
        <>
          <ResizeHandle onMouseDown={onMouseDown} isDragging={isDragging} />
          <TaskDetail width={width} />
        </>
      )}
    </div>
  );
}
