import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTagStore } from "@/store/tags";
import { getRepository } from "@/store/repository";
import { PRESET_COLORS } from "@/lib/colors";

interface TagSelectorProps {
  readonly selectedTagIds: string[];
  readonly onChange: (tagIds: string[]) => void;
  readonly triggerClassName?: string;
}

export function TagSelector({ selectedTagIds, onChange, triggerClassName }: TagSelectorProps) {
  const { t } = useTranslation();
  const { tags, createTag } = useTagStore();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[5]);
  const [showCreate, setShowCreate] = useState(false);

  function toggle(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const tag = await createTag(getRepository(), { name: newName.trim(), color: newColor });
    onChange([...selectedTagIds, tag.id]);
    setNewName("");
    setNewColor(PRESET_COLORS[5]);
    setShowCreate(false);
  }

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-2 h-7 px-2 justify-start flex-wrap max-w-xs",
          triggerClassName
        )}
      >
        <Tag className="h-3.5 w-3.5 shrink-0" />
        {selectedTags.length === 0 ? (
          <span className="text-xs">{t('tag.tags')}</span>
        ) : (
          selectedTags.map((t) => (
            <Badge
              key={t.id}
              variant="secondary"
              className="text-xs h-4"
              style={t.color ? {
                backgroundColor: `${t.color}28`,
                color: t.color,
                borderColor: `${t.color}50`,
              } : undefined}
            >
              {t.name}
            </Badge>
          ))
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {tags.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('tag.noTags')}</p>
          )}
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
                <span className="flex-1 text-left truncate">{tag.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>

        {showCreate ? (
          <div className="mt-2 space-y-2 border-t border-border pt-2">
            <Input
              placeholder={t('tag.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flex gap-1 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-4 w-4 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: newColor === c ? `2px solid ${c}` : undefined,
                    outlineOffset: newColor === c ? "2px" : undefined,
                  }}
                  aria-label={t('common.colorOption', { color: c })}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-7" onClick={() => setShowCreate(false)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" className="flex-1 h-7" disabled={!newName.trim()} onClick={handleCreate}>
                {t('common.create')}
              </Button>
            </div>
          </div>
        ) : (
          <button
            className="mt-2 flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border-t border-border pt-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('tag.new')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
