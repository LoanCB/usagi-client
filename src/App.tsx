import Database from "@tauri-apps/plugin-sql";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { ChangelogDialog } from "@/components/layout/ChangelogDialog";
import { UpdateBanner } from "@/components/layout/UpdateBanner";
import { adaptDatabase, createRepository } from "@/db";
// Load migration SQL at build time (Vite raw import)
import migrationSql from "@/db/migrations/001_initial.sql?raw";
import migration002 from "@/db/migrations/002_add_description.sql?raw";
import migration003 from "@/db/migrations/003_settings.sql?raw";
import migration004 from "@/db/migrations/004_tags_project_scope.sql?raw";
import migration005 from "@/db/migrations/005_project_groups.sql?raw";
import migration006 from "@/db/migrations/006_extend_priority.sql?raw";
import { runMigrations } from "@/db/migrations/run-migrations";
import { useOverdueNotifications } from "@/hooks/useOverdueNotifications";
import { UpdaterContext, useUpdater } from "@/hooks/useUpdater";
import { getReleasedVersions, getVersionsSince } from "@/lib/changelog";
import { useProjectGroupStore } from "@/store/projectGroups";
import { useProjectStore } from "@/store/projects";
import { getRepository, setRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useShortcutsStore } from "@/store/shortcuts";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { ThemeProvider } from "@/theme/ThemeProvider";
import type { ChangelogVersion } from "@/types/changelog";

export function AppContent() {
	const loadTasks = useTaskStore((s) => s.loadTasks);
	const loadProjects = useProjectStore((s) => s.loadProjects);
	const loadGroups = useProjectGroupStore((s) => s.loadGroups);
	const loadTags = useTagStore((s) => s.loadTags);
	const loadSettings = useSettingsStore((s) => s.loadSettings);
	const betaChannel = useSettingsStore((s) => s.betaChannel);
	const loadShortcuts = useShortcutsStore((s) => s.loadShortcuts);
	const tasks = useTaskStore((s) => s.tasks);
	useOverdueNotifications(tasks);

	const updater = useUpdater();
	const [changelogPopup, setChangelogPopup] = useState<
		ChangelogVersion[] | null
	>(null);

	// oxlint-disable-next-line react-doctor/no-set-state-after-await-in-effect -- the post-await setChangelogPopup is already guarded by the `cancelled` flag set in the cleanup below
	useEffect(() => {
		const repo = getRepository();
		// Ignore late async resolutions if the effect re-runs (deps change) or
		// the component unmounts, so we never write stale changelog state.
		let cancelled = false;
		async function load() {
			await loadSettings(repo);
			await loadShortcuts(repo);
			loadProjects(repo);
			loadGroups(repo);
			loadTags(repo);
			loadTasks(repo, {});

			// After an update, surface the versions released since the user's
			// last visit. First launch records the current version silently.
			const { lastSeenChangelogVersion, setLastSeenChangelogVersion } =
				useSettingsStore.getState();
			const latest = getReleasedVersions()[0]?.version;
			if (latest) {
				if (!lastSeenChangelogVersion) {
					await setLastSeenChangelogVersion(repo, latest);
				} else if (lastSeenChangelogVersion !== latest) {
					const newer = getVersionsSince(lastSeenChangelogVersion);
					if (newer.length > 0 && !cancelled) setChangelogPopup(newer);
					await setLastSeenChangelogVersion(repo, latest);
				}
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [
		loadSettings,
		loadTasks,
		loadTags,
		loadShortcuts,
		loadProjects,
		loadGroups,
	]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		updater.checkForUpdate(betaChannel);
	}, [updater.checkForUpdate, betaChannel]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<UpdaterContext.Provider value={updater}>
			<AppShell />
			<UpdateBanner />
			{changelogPopup && (
				<ChangelogDialog
					versions={changelogPopup}
					onClose={() => setChangelogPopup(null)}
				/>
			)}
		</UpdaterContext.Provider>
	);
}

export default function App() {
	const { t } = useTranslation();
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const initStarted = useRef(false);

	useEffect(() => {
		// Guard against React StrictMode double-invoking this effect in dev,
		// which would run the migrations concurrently and lock the SQLite DB.
		if (initStarted.current) return;
		initStarted.current = true;

		async function init() {
			try {
				const db = await Database.load("sqlite:usagi.db");
				await runMigrations(adaptDatabase(db), [
					migrationSql,
					migration002,
					migration003,
					migration004,
					migration005,
					migration006,
				]);
				setRepository(createRepository(db));
				setReady(true);
			} catch (err) {
				setError(String(err));
			}
		}
		init();
	}, []);

	if (error) {
		return (
			<div className="flex items-center justify-center h-screen text-destructive">
				{t("app.dbError", { error })}
			</div>
		);
	}

	if (!ready) {
		return (
			<div className="flex items-center justify-center h-screen text-muted-foreground">
				{t("app.loading")}
			</div>
		);
	}

	return (
		<ThemeProvider>
			<AppContent />
		</ThemeProvider>
	);
}
