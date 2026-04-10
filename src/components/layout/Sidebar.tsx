import { ChevronLeft, ChevronRight, Inbox, Calendar, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui";
import { useProjectStore } from "@/store/projects";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, collapsed, onClick }: NavItemProps) {
  const inner = (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground font-medium"
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
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

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, selectedProjectId, setSelectedProject } =
    useUIStore();
  const projects = useProjectStore((s) => s.projects);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-secondary border-r border-border shrink-0 transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
    >
      {/* Toggle button */}
      <div className="flex justify-end p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        {/* Smart lists */}
        <div className="space-y-1 pb-2">
          {!sidebarCollapsed && (
            <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Vues
            </p>
          )}
          <NavItem
            icon={<Inbox className="h-4 w-4" />}
            label="Inbox"
            active={selectedProjectId === null}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject(null)}
          />
          <NavItem
            icon={<Calendar className="h-4 w-4" />}
            label="Aujourd'hui"
            active={selectedProjectId === "today"}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject("today")}
          />
          <NavItem
            icon={<ListChecks className="h-4 w-4" />}
            label="Toutes les tâches"
            active={selectedProjectId === undefined}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedProject(undefined)}
          />
        </div>

        {projects.length > 0 && (
          <>
            <Separator className="my-2" />
            <div className="space-y-1 pb-2">
              {!sidebarCollapsed && (
                <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Projets
                </p>
              )}
              {projects.map((project) => (
                <NavItem
                  key={project.id}
                  icon={
                    <span
                      className="h-4 w-4 rounded-sm flex items-center justify-center text-xs"
                      style={{ background: project.color ?? "var(--muted)" }}
                    >
                      {project.icon ?? "📁"}
                    </span>
                  }
                  label={project.name}
                  active={selectedProjectId === project.id}
                  collapsed={sidebarCollapsed}
                  onClick={() => setSelectedProject(project.id)}
                />
              ))}
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  );
}
