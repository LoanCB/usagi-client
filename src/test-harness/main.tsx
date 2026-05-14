// tauri-stubs MUST be first — it sets window.__TAURI_INTERNALS__ before
// any other module that might call into the Tauri SDK.
import "./tauri-stubs";
import "../index.css";
import "@/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import { AppContent } from "@/App";
import { MemoryRepository } from "./MemoryRepository";
import { setRepository } from "@/store/repository";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { useProjectStore } from "@/store/projects";
import { useTagStore } from "@/store/tags";
import { useTaskStore } from "@/store/tasks";
import { useUIStore } from "@/store/ui";

declare global {
  interface Window {
    __REPO__: MemoryRepository;
    __reloadStores: () => Promise<void>;
  }
}

const repo = new MemoryRepository();
window.__REPO__ = repo;
setRepository(repo);

window.__reloadStores = async () => {
  useUIStore.getState().setSelectedProject(undefined);
  const { loadProjects } = useProjectStore.getState();
  const { loadTags } = useTagStore.getState();
  const { loadTasks } = useTaskStore.getState();
  await Promise.all([loadProjects(repo), loadTags(repo)]);
  await loadTasks(repo, {});
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  </React.StrictMode>,
);
