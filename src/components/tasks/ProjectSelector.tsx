import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { Check, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projects";
import { PRESET_ICONS } from "@/lib/icons";
import type { Project } from "@/types";

interface ProjectSelectorProps {
  readonly value: string | null;
  readonly onChange: (projectId: string | null) => void;
}

function ProjectIcon({ project, className }: { project: Project; className?: string }) {
  const iconDef = PRESET_ICONS.find((i) => i.name === project.icon) ?? PRESET_ICONS[0];
  const Icon = iconDef.icon;
  return <Icon className={className} style={{ color: project.color ?? undefined }} />;
}

export function ProjectSelector({ value, onChange }: ProjectSelectorProps) {
  const { t } = useTranslation();
  const { projects } = useProjectStore();

  const selectedProject = projects.find((p) => p.id === value) ?? null;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2 h-7 px-2 justify-start")}
      >
        {selectedProject ? (
          <ProjectIcon project={selectedProject} className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Inbox className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="text-xs truncate">
          {selectedProject?.name ?? t("nav.inbox")}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="space-y-0.5">
          {/* Inbox option */}
          <button
            onClick={() => onChange(null)}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
              value === null && "bg-accent"
            )}
          >
            <Inbox className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left truncate">{t("nav.inbox")}</span>
            {value === null && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>

          {projects.map((project) => {
            const selected = value === project.id;
            return (
              <button
                key={project.id}
                onClick={() => onChange(project.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
                  selected && "bg-accent"
                )}
              >
                <ProjectIcon project={project} className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left truncate">{project.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
