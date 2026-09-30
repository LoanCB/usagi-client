import { appConfigDir, join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CalendarView } from "@/components/calendar/CalendarView";
import { ArchiveView } from "@/components/layout/ArchiveView";
import { FirstSyncDialog } from "@/components/sync/FirstSyncDialog";
import { SyncStatusBanner } from "@/components/sync/SyncStatusBanner";
import { TagManager } from "@/components/tags/TagManager";
import { useOrbParallax } from "@/hooks/useOrbParallax";
import { useResizable } from "@/hooks/useResizable";
import { automaticBackupName } from "@/lib/backup-file";
import { type ExportData, exportData } from "@/lib/dataTransfer";
import { isMac } from "@/lib/utils";
import { getRepository } from "@/store/repository";
import { useSearchStore } from "@/store/search";
import { useSettingsStore } from "@/store/settings";
import { useSyncStore } from "@/store/sync";
import { useUIStore } from "@/store/ui";
import { remoteToExportData } from "@/sync/remote-export";
import { getSyncRuntime } from "@/sync/runtime";
import type { FirstSyncChoice } from "@/sync/types";
import { sealBackup } from "@/vault";
import {
	reloadStoresAfterFirstSync,
	reloadStoresAfterSync,
} from "./first-sync-reload";
import { GlobalSearch } from "./GlobalSearch";
import { ResizeHandle } from "./ResizeHandle";
import { Sidebar } from "./Sidebar";
import { TaskDetail } from "./TaskDetail";
import { TaskList } from "./TaskList";

/** §6.4: the destructive first-sync choices erase data, so a backup of what
 * they erase must exist first — automatic, with no save dialog. */
async function writeAutomaticBackup(
	choice: Exclude<FirstSyncChoice, "merge">,
): Promise<void> {
	// app_config_dir, not app_data_dir: on Linux they are different paths and
	// nothing creates the latter, so writeTextFile used to fail ENOENT and the
	// §6.4 "Replace" branch was unreachable. src-tauri/src/db.rs create_dir_all's
	// this one to hold the database, so it is guaranteed to exist.
	const [data, dir] = await Promise.all([
		choice === "remote" ? exportThisDevice() : exportAccount(),
		appConfigDir(),
	]);
	// Sealed in Rust under the database key: a plaintext copy beside the
	// encrypted database would undo the encryption.
	await writeTextFile(
		await join(dir, automaticBackupName(new Date())),
		await sealBackup(JSON.stringify(data)),
	);
}

function exportThisDevice(): Promise<ExportData> {
	return exportData(getRepository(), {
		activeTasks: true,
		completedTasks: true,
		archivedTasks: true,
		projects: true,
		tags: true,
	});
}

async function exportAccount(): Promise<ExportData> {
	const engine = getSyncRuntime()?.engine;
	if (!engine) throw new Error("sync is not running");
	return remoteToExportData(
		await engine.exportRemote(),
		new Date().toISOString(),
	);
}

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
	const { selectedTaskId, selectedProjectId, openSettings } = useUIStore();
	const parallaxEnabled = useSettingsStore((s) => s.parallaxEnabled);
	const glassmorphismEnabled = useSettingsStore((s) => s.glassmorphismEnabled);
	const syncStatus = useSyncStore((s) => s.status);
	const syncRevision = useSyncStore((s) => s.revision);
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

	// Projects, groups and tags have no per-view filter, so they reload centrally
	// once a sync cycle has applied rows. Tasks do not: TaskList reloads itself,
	// keeping the active view's filters. Skipped on the first render, where
	// App.tsx has just done the initial load.
	useEffect(() => {
		if (syncRevision === 0) return;
		reloadStoresAfterSync();
	}, [syncRevision]);

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
		<div className="app-shell relative flex h-dvh overflow-hidden text-foreground">
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

			<div className="relative z-10 flex h-full w-full flex-col overflow-hidden">
				<SyncStatusBanner onOpenSettings={openSettings} />
				<div className="flex flex-1 overflow-hidden">
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
			</div>
			<GlobalSearch />
			{syncStatus === "awaiting-first-sync" && (
				<FirstSyncDialog
					open
					backup={writeAutomaticBackup}
					resolve={(choice) =>
						getSyncRuntime()?.engine.resolveFirstSync(choice) ??
						Promise.resolve()
					}
					onResolved={reloadStoresAfterFirstSync}
				/>
			)}
		</div>
	);
}
