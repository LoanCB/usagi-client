import Database from "@tauri-apps/plugin-sql";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { createRepository } from "@/db";
// Load migration SQL at build time (Vite raw import)
import migrationSql from "@/db/migrations/001_initial.sql?raw";
import migration002 from "@/db/migrations/002_add_description.sql?raw";
import migration003 from "@/db/migrations/003_settings.sql?raw";
import { useOverdueNotifications } from "@/hooks/useOverdueNotifications";
import { useProjectStore } from "@/store/projects";
import { getRepository, setRepository } from "@/store/repository";
import { useSettingsStore } from "@/store/settings";
import { useShortcutsStore } from "@/store/shortcuts";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { ThemeProvider } from "@/theme/ThemeProvider";

function AppContent() {
	const loadTasks = useTaskStore((s) => s.loadTasks);
	const loadProjects = useProjectStore((s) => s.loadProjects);
	const loadTags = useTagStore((s) => s.loadTags);
	const loadSettings = useSettingsStore((s) => s.loadSettings);
	const loadShortcuts = useShortcutsStore((s) => s.loadShortcuts);
	const tasks = useTaskStore((s) => s.tasks);
	useOverdueNotifications(tasks);

	useEffect(() => {
		const repo = getRepository();
		async function load() {
			await loadSettings(repo);
			await loadShortcuts(repo);
			loadProjects(repo);
			loadTags(repo);
			loadTasks(repo, {});
		}
		load();
	}, [loadSettings, loadTasks, loadTags, loadShortcuts, loadProjects]); // eslint-disable-line react-hooks/exhaustive-deps

	return <AppShell />;
}

export default function App() {
	const { t } = useTranslation();
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function init() {
			try {
				const db = await Database.load("sqlite:usagi.db");
				// Run migrations sequentially (idempotent)
				for (const migration of [migrationSql, migration002, migration003]) {
					for (const statement of migration
						.split(";")
						.map((s) => s.trim())
						.filter(Boolean)) {
						await db.execute(statement).catch(() => {
							// Ignore "duplicate column" errors from ALTER TABLE on subsequent runs
						});
					}
				}
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
