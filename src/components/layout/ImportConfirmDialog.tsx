import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExportData } from "@/lib/dataTransfer";

interface ImportConfirmDialogProps {
  readonly data: ExportData;
  readonly onConfirm: (strategy: "merge" | "replace") => void;
  readonly onCancel: () => void;
}

export function ImportConfirmDialog({
  data,
  onConfirm,
  onCancel,
}: ImportConfirmDialogProps) {
  const { t } = useTranslation();
  const [hoverReplace, setHoverReplace] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("data.importConfirmTitle")}</DialogTitle>
        </DialogHeader>

        <DialogDescription>
          {t("data.importSummary", {
            tasks: data.tasks.length,
            projects: data.projects.length,
            tags: data.tags.length,
          })}
        </DialogDescription>

        <div className="flex flex-col gap-2 pt-2">
          <Button variant="default" onClick={() => onConfirm("merge")}>
            {t("data.merge")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm("replace")}
            onMouseEnter={() => setHoverReplace(true)}
            onMouseLeave={() => setHoverReplace(false)}
            onFocus={() => setHoverReplace(true)}
            onBlur={() => setHoverReplace(false)}
          >
            {t("data.replace")}
          </Button>
          <p
            aria-hidden={!hoverReplace}
            className={`flex items-center gap-1.5 text-xs text-destructive transition-opacity ${hoverReplace ? "opacity-100" : "opacity-0"}`}
          >
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            {t("data.replaceWarning")}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-1 text-muted-foreground"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
