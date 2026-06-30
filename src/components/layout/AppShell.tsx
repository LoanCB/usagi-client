import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CalendarView } from "@/components/calendar/CalendarView";
import { ArchiveView } from "@/components/layout/ArchiveView";
import { TagManager } from "@/components/tags/TagManager";
import { useOrbParallax } from "@/hooks/useOrbParallax";
import { useResizable } from "@/hooks/useResizable";
import { isMac } from "@/lib/utils";
import { useSearchStore } from "@/store/search";
import { useSettingsStore } from "@/store/settings";
import { useUIStore } from "@/store/ui";
import { GlobalSearch } from "./GlobalSearch";
import { ResizeHandle } from "./ResizeHandle";
import { Sidebar } from "./Sidebar";
import { TaskDetail } from "./TaskDetail";
import { TaskList } from "./TaskList";

function MainPanel({
	selectedProjectId,
}: {
	selectedProjectId: string | null | undefined;
}) {
	if (selectedProjectId === "tags") return <TagManager />;
	if (selectedProjectId === "calendar") return <CalendarView />;
	if (selectedProjectId === "archives") return <ArchiveView />;
	return <TaskList />;
}

export function AppShell() {
	const { t } = useTranslation();
	const { selectedTaskId, selectedProjectId } = useUIStore();
	const parallaxEnabled = useSettingsStore((s) => s.parallaxEnabled);
	const glassmorphismEnabled = useSettingsStore((s) => s.glassmorphismEnabled);
	const { width, isDragging, onMouseDown, onDoubleClick, onKeyDown } =
		useResizable({
			storageKey: "task-detail-width",
			defaultWidth: 320,
			minWidth: 240,
			maxWidth: 600,
		});
	const { setOrbRef } = useOrbParallax(parallaxEnabled && glassmorphismEnabled);
	const toggleSearch = useSearchStore((s) => s.toggle);

	useEffect(() => {
		document.documentElement.classList.toggle("glass", glassmorphismEnabled);
	}, [glassmorphismEnabled]);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const modifier = isMac() ? e.metaKey : e.ctrlKey;
			if (modifier && e.key === "k") {
				e.preventDefault();
				toggleSearch();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [toggleSearch]);

	const showDetail =
		selectedTaskId &&
		selectedProjectId !== "tags" &&
		selectedProjectId !== "archives";

	return (
		<div className="app-shell relative flex h-screen overflow-hidden text-foreground">
			{glassmorphismEnabled && (
				<>
					<div className="app-vignette pointer-events-none absolute inset-0 z-[1]" />
					<div
						ref={setOrbRef(0)}
						className="pointer-events-none absolute inset-0 z-0"
					>
						<div className="app-orb-wrap-1 absolute inset-0">
							<div className="app-orb-1 absolute" />
						</div>
					</div>
					<div
						ref={setOrbRef(1)}
						className="pointer-events-none absolute inset-0 z-0"
					>
						<div className="app-orb-wrap-2 absolute inset-0">
							<div className="app-orb-2 absolute" />
						</div>
					</div>
					<div
						ref={setOrbRef(2)}
						className="pointer-events-none absolute inset-0 z-0"
					>
						<div className="app-orb-wrap-3 absolute inset-0">
							<div className="app-orb-3 absolute" />
						</div>
					</div>
				</>
			)}

			<div className="relative z-10 flex h-full w-full overflow-hidden">
				<Sidebar />
				<MainPanel selectedProjectId={selectedProjectId} />
				{showDetail && (
					<>
						<ResizeHandle
							onMouseDown={onMouseDown}
							onDoubleClick={onDoubleClick}
							onKeyDown={onKeyDown}
							isDragging={isDragging}
							ariaLabel={t("common.resizePanel")}
						/>
						<TaskDetail width={width} />
					</>
				)}
			</div>
			<GlobalSearch />
		</div>
	);
}
