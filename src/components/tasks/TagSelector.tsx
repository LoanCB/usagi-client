import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTagStore } from "@/store/tags";

interface TagSelectorProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagSelector({ selectedTagIds, onChange }: TagSelectorProps) {
  const tags = useTagStore((s) => s.tags);

  function toggle(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  }

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-2 h-7 px-2 flex-wrap max-w-xs"
        )}
      >
        <Tag className="h-3.5 w-3.5 shrink-0" />
        {selectedTags.length === 0 ? (
          <span className="text-xs">Tags</span>
        ) : (
          selectedTags.map((t) => (
            <Badge key={t.id} variant="secondary" className="text-xs h-4">
              {t.name}
            </Badge>
          ))
        )}
      </PopoverTrigger>
      <PopoverContent className="w-52" align="start">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Aucun tag créé
          </p>
        ) : (
          <div className="space-y-1">
            {tags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggle(tag.id)}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors",
                    selected && "bg-accent"
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: tag.color ?? "var(--muted-foreground)" }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
