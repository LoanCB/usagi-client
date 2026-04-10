import { useEffect, useState } from "react";
import Database from "@tauri-apps/plugin-sql";
import { createRepository } from "@/db";
import { setRepository, getRepository } from "@/store/repository";
import { useTaskStore } from "@/store/tasks";
import { useProjectStore } from "@/store/projects";
import { useTagStore } from "@/store/tags";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppShell } from "@/components/layout/AppShell";

// Load migration SQL at build time (Vite raw import)
import migrationSql from "@/db/migrations/001_initial.sql?raw";

function AppContent() {
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loadTags = useTagStore((s) => s.loadTags);

  useEffect(() => {
    const repo = getRepository();
    loadProjects(repo);
    loadTags(repo);
    loadTasks(repo, { projectId: null }); // Start on Inbox
  }, []);

  return <AppShell />;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const db = await Database.load("sqlite:usagi.db");
        // Run migration (idempotent CREATE TABLE IF NOT EXISTS)
        for (const statement of migrationSql
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)) {
          await db.execute(statement);
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
        Failed to initialize database: {error}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
