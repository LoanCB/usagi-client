import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTagStore } from "@/store/tags";
import { getRepository } from "@/store/repository";
import { PRESET_COLORS } from "@/lib/colors";

function ColorPicker({ value, onChange }: { readonly value: string; readonly onChange: (c: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="h-5 w-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
          style={{
            background: c,
            outline: value === c ? `2px solid ${c}` : undefined,
            outlineOffset: value === c ? "2px" : undefined,
          }}
          aria-label={t('common.colorOption', { color: c })}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function TagManager() {
  const { t } = useTranslation();
  const { tags, createTag, updateTag, deleteTag } = useTagStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(PRESET_COLORS[5]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[5]);
  const [showNew, setShowNew] = useState(false);

  function startEdit(id: string, name: string, color: string | null) {
    setEditingId(id);
    setEditName(name);
    setEditColor(color ?? PRESET_COLORS[5]);
  }

  async function commitEdit() {
    if (!editName.trim() || !editingId) return;
    await updateTag(getRepository(), editingId, { name: editName.trim(), color: editColor });
    setEditingId(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await createTag(getRepository(), { name: newName.trim(), color: newColor });
    setNewName("");
    setNewColor(PRESET_COLORS[5]);
    setShowNew(false);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-base">{t('tag.tags')}</h2>
        <Button size="sm" variant="ghost" onClick={() => setShowNew(true)} aria-label={t('tag.new')}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* New tag form */}
        {showNew && (
          <div className="rounded-md border border-border p-3 space-y-2 mb-2">
            <Input
              placeholder={t('tag.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" disabled={!newName.trim()} onClick={handleCreate}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {tags.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground text-center py-12">
            {t('tag.noTags')}
          </p>
        )}

        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/40 group"
          >
            {editingId === tag.id ? (
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: editColor }}
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={commitEdit}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
            ) : (
              <>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: tag.color ?? "var(--muted-foreground)" }}
                />
                <span className="flex-1 text-sm truncate">{tag.name}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => startEdit(tag.id, tag.name, tag.color)}
                    aria-label={t('tag.edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteTag(getRepository(), tag.id)}
                    aria-label={t('tag.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
