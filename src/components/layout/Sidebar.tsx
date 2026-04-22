import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Calendar, ListChecks, Plus, MoreVertical, Pencil, Trash2, Tags, Settings2 } from "lucide-react";
import { PRESET_ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn, todayIso } from "@/lib/utils";
import { useUIStore } from "@/store/ui";
import { useProjectStore } from "@/store/projects";
import { useTaskStore } from "@/store/tasks";
import { getRepository } from "@/store/repository";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import type { Project } from "@/types";

interface NavItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly active: boolean;
  readonly collapsed: boolean;
  readonly onClick: () => void;
  readonly count?: number;
}

function NavItem({ icon, label, active, collapsed, onClick, count }: NavItemProps) {
  const inner = (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm text-left transition-colors",
        "border-l-2 border-transparent",
        "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
        active && "bg-sidebar-primary/20 text-sidebar-foreground font-medium border-sidebar-primary"
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate flex-1">{label}</span>}
      {!collapsed && count !== undefined && (
        <span className="ml-auto text-xs text-muted-foreground/70 bg-foreground/[0.06] rounded-full min-w-[1.25rem] text-center px-1.5 py-0.5 leading-none shrink-0">
          {count}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger>{inner}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return inner;
}

interface ProjectNavItemProps {
  readonly project: Project;
  readonly active: boolean;
  readonly collapsed: boolean;
  readonly onClick: () => void;
  readonly count?: number;
}

function ProjectNavItem({ project, active, collapsed, onClick, count }: ProjectNavItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { deleteProject } = useProjectStore();
  const { selectedProjectId, setSelectedProject } = useUIStore();
  const { t } = useTranslation();

  async function handleDelete() {
    await deleteProject(getRepository(), project.id);
    if (selectedProjectId === project.id) setSelectedProject(null);
  }

  const iconDef = PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
  const ProjectIcon = iconDef.icon;

  const icon = (
    <ProjectIcon
      className="h-4 w-4 shrink-0"
      style={{ color: project.color ?? undefined }}
    />
  );

  const inner = (
    <button
      className={cn(
        "group flex items-center gap-2 w-full pl-[10px] pr-3 py-2 rounded-md text-sm text-left transition-colors",
        "border-l-2 border-transparent",
        "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:border-sidebar-primary/50",
        active && "bg-sidebar-primary/20 text-sidebar-foreground font-medium border-sidebar-primary"
      )}
      onClick={onClick}
    >
      {icon}
      {!collapsed && (
        <>
          <span className="truncate flex-1">{project.name}</span>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-sidebar-foreground/10 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label={t('project.options')}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem
                render={
                  <button className="w-full flex items-center gap-2" onClick={() => { setMenuOpen(false); setEditOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                    {t('common.edit')}
                  </button>
                }
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground/70 bg-foreground/[0.06] rounded-full min-w-[1.25rem] text-center px-1.5 py-0.5 leading-none shrink-0">
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );

  const editDialog = (
    <ProjectForm project={project} open={editOpen} onOpenChange={setEditOpen} />
  );

  if (collapsed) {
    return (
      <>
        <TooltipProvider delay={300}>
          <Tooltip>
            <TooltipTrigger>{inner}</TooltipTrigger>
            <TooltipContent side="right">{project.name}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {editDialog}
      </>
    );
  }
  return (
    <>
      {inner}
      {editDialog}
    </>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, setSidebarCollapsed, selectedProjectId, setSelectedProject } =
    useUIStore();
  const projects = useProjectStore((s) => s.projects);
  const tasks = useTaskStore((s) => s.tasks);
  const today = todayIso();
  const allCount = tasks.filter((t) => !t.completedAt).length;
  const todayCount = tasks.filter((t) => !t.completedAt && t.dueDate !== null && t.dueDate <= today).length;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
    >
      <div className="flex justify-end p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1.5 pb-2">
          {!sidebarCollapsed && (
            <p className="px-3 py-1 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
              {t('nav.views')}
            </p>
          )}
          <NavItem
            icon={<Calendar className="h-4 w-4" />}
            label={t('nav.today')}
            active={selectedProjectId === "today"}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject("today")}
            count={todayCount}
          />
          <NavItem
            icon={<ListChecks className="h-4 w-4" />}
            label={t('nav.allTasks')}
            active={selectedProjectId === undefined}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject(undefined)}
            count={allCount}
          />
          <NavItem
            icon={<Tags className="h-4 w-4" />}
            label={t('nav.tags')}
            active={selectedProjectId === "tags"}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject("tags")}
          />
        </div>

        <Separator className="my-2 bg-sidebar-border" />

        <div className="space-y-1.5 pb-2">
          {!sidebarCollapsed && (
            <div className="flex items-center justify-between px-3 py-1">
              <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                {t('nav.projects')}
              </p>
              <ProjectForm>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  aria-label={t('project.new')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </ProjectForm>
            </div>
          )}
          {projects.map((project) => (
            <ProjectNavItem
              key={project.id}
              project={project}
              active={selectedProjectId === project.id}
              collapsed={sidebarCollapsed}
              onClick={() => setSelectedProject(project.id)}
              count={tasks.filter((t) => !t.completedAt && t.projectId === project.id).length}
            />
          ))}
          {sidebarCollapsed && (
            <ProjectForm>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label={t('project.new')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </ProjectForm>
          )}
        </div>
      </ScrollArea>

      <SettingsDialog>
        <div className={cn(
          "flex border-t border-sidebar-border px-2 py-2",
          sidebarCollapsed ? "justify-center" : "justify-start"
        )}>
          <button
            type="button"
            className="flex items-center gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors text-sm focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            aria-label={t("settings.title")}
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>{t("settings.title")}</span>}
          </button>
        </div>
      </SettingsDialog>
    </div>
  );
}
