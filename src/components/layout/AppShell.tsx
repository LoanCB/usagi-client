import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TaskList } from "./TaskList";
import { TaskDetail } from "./TaskDetail";
import { ResizeHandle } from "./ResizeHandle";
import { TagManager } from "@/components/tags/TagManager";
import { useUIStore } from "@/store/ui";
import { useResizable } from "@/hooks/useResizable";
import { useOrbParallax } from "@/hooks/useOrbParallax";
import { useSettingsStore } from "@/store/settings";

export function AppShell() {
  const { selectedTaskId, selectedProjectId } = useUIStore();
  const parallaxEnabled = useSettingsStore((s) => s.parallaxEnabled);
  const glassmorphismEnabled = useSettingsStore((s) => s.glassmorphismEnabled);
  const { width, isDragging, onMouseDown } = useResizable({
    storageKey: "task-detail-width",
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 600,
  });
  const { setOrbRef } = useOrbParallax(parallaxEnabled && glassmorphismEnabled);

  useEffect(() => {
    document.documentElement.classList.toggle("glass", glassmorphismEnabled);
  }, [glassmorphismEnabled]);

  const showDetail = selectedTaskId && selectedProjectId !== "tags";

  return (
    <div className="app-shell relative flex h-screen overflow-hidden text-foreground">
      {glassmorphismEnabled && (
        <>
          <div className="app-vignette pointer-events-none absolute inset-0 z-[1]" />
          <div ref={setOrbRef(0)} className="pointer-events-none absolute inset-0 z-0">
            <div className="app-orb-wrap-1 absolute inset-0">
              <div className="app-orb-1 absolute" />
            </div>
          </div>
          <div ref={setOrbRef(1)} className="pointer-events-none absolute inset-0 z-0">
            <div className="app-orb-wrap-2 absolute inset-0">
              <div className="app-orb-2 absolute" />
            </div>
          </div>
          <div ref={setOrbRef(2)} className="pointer-events-none absolute inset-0 z-0">
            <div className="app-orb-wrap-3 absolute inset-0">
              <div className="app-orb-3 absolute" />
            </div>
          </div>
        </>
      )}

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
