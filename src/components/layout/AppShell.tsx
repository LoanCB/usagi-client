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
    <div className="app-shell relative flex h-screen overflow-hidden text-foreground">
      {/* Vignette overlay */}
      <div className="app-vignette pointer-events-none absolute inset-0 z-[1]" />

      {/* Floating orbs */}
      <div className="app-orb-wrap-1 pointer-events-none absolute inset-0 z-0">
        <div className="app-orb-1 absolute" />
      </div>
      <div className="app-orb-wrap-2 pointer-events-none absolute inset-0 z-0">
        <div className="app-orb-2 absolute" />
      </div>
      <div className="app-orb-wrap-3 pointer-events-none absolute inset-0 z-0">
        <div className="app-orb-3 absolute" />
      </div>

      {/* App content */}
      <div className="relative z-10 flex h-full w-full overflow-hidden">
        <Sidebar />
        {selectedProjectId === "tags" ? <TagManager /> : <TaskList />}
        {showDetail && (
          <>
            <ResizeHandle onMouseDown={onMouseDown} isDragging={isDragging} />
            <TaskDetail width={width} />
          </>
        )}
      </div>
    </div>
  );
}
