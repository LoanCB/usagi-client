# Archive Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton "Dates ▾" dans le header de la vue archive ouvrant un Popover avec deux filtres de plage de date (archivage + échéance), presets rapides, et calendrier inline.

**Architecture:** Nouveau composant `ArchiveDateFilter` (Popover + Calendar range de react-day-picker) branché sur deux états locaux dans `ArchiveView`. Filtrage 100 % local via `filteredTasks` (useMemo). La fonction `inRange` est exportée pour pouvoir être testée en isolation.

**Tech Stack:** React, TypeScript, Tailwind CSS, react-day-picker (déjà présent), i18next, Vitest + RTL

---

## Files

| Action | Fichier                                       | Rôle                                                   |
| ------ | --------------------------------------------- | ------------------------------------------------------ |
| Modify | `src/i18n/locales/en.ts`                      | 5 nouvelles clés `archive.*`                           |
| Modify | `src/i18n/locales/fr.ts`                      | 5 nouvelles clés `archive.*`                           |
| Create | `src/components/layout/ArchiveDateFilter.tsx` | Composant Popover + exports `DateRange`, `inRange`     |
| Create | `src/test/ArchiveDateFilter.test.ts`          | Tests unitaires de `inRange`                           |
| Modify | `src/components/layout/ArchiveView.tsx`       | État + filtrage + `<ArchiveDateFilter>` dans le header |

---

### Task 1 : Ajouter les clés i18n

**Files:**

- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`

- [ ] **Step 1 : Ajouter les clés dans `en.ts`**

Dans `src/i18n/locales/en.ts`, dans le bloc `archive:`, ajouter après `noResults` :

```ts
archive: {
    empty: "No archived tasks",
    archivedOn: "Archived on {{date}}",
    noResults: "No tasks match your filters",
    filterDates: "Dates",
    filterArchivedDate: "Archived date",
    preset7d: "Last 7 days",
    preset30d: "Last 30 days",
    presetMonth: "This month",
},
```

- [ ] **Step 2 : Ajouter les clés dans `fr.ts`**

Dans `src/i18n/locales/fr.ts`, même bloc :

```ts
archive: {
    empty: "Aucune tâche archivée",
    archivedOn: "Archivée le {{date}}",
    noResults: "Aucune tâche ne correspond aux filtres",
    filterDates: "Dates",
    filterArchivedDate: "Date d'archivage",
    preset7d: "7 derniers jours",
    preset30d: "30 jours",
    presetMonth: "Ce mois",
},
```

- [ ] **Step 3 : Vérifier TypeScript**

```bash
pnpm tsc --noEmit
```

Résultat attendu : aucune erreur.

---

### Task 2 : Tests unitaires de `inRange` (TDD)

**Files:**

- Create: `src/test/ArchiveDateFilter.test.ts`

- [ ] **Step 1 : Créer le fichier de test**

Créer `src/test/ArchiveDateFilter.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { inRange } from "@/components/layout/ArchiveDateFilter";

const TODAY = "2026-06-02";

describe("inRange", () => {
  it("retourne true quand la plage est vide", () => {
    expect(inRange("2026-05-01", { from: null, to: null }, TODAY)).toBe(true);
  });

  it("retourne true quand date est null et plage vide", () => {
    expect(inRange(null, { from: null, to: null }, TODAY)).toBe(true);
  });

  it("retourne false quand date est null et plage définie", () => {
    expect(inRange(null, { from: "2026-05-01", to: "2026-05-31" }, TODAY)).toBe(
      false,
    );
  });

  it("retourne true quand date est dans la plage", () => {
    expect(
      inRange("2026-05-15", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(true);
  });

  it("retourne true sur les bornes exactes", () => {
    expect(
      inRange("2026-05-01", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(true);
    expect(
      inRange("2026-05-31", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(true);
  });

  it("retourne false quand date est avant la plage", () => {
    expect(
      inRange("2026-04-30", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(false);
  });

  it("retourne false quand date est après la plage", () => {
    expect(
      inRange("2026-06-01", { from: "2026-05-01", to: "2026-05-31" }, TODAY),
    ).toBe(false);
  });

  it("utilise today comme borne supérieure quand seulement from est défini", () => {
    expect(inRange("2026-05-01", { from: "2026-05-01", to: null }, TODAY)).toBe(
      true,
    );
    expect(inRange(TODAY, { from: "2026-05-01", to: null }, TODAY)).toBe(true);
    expect(inRange("2026-06-03", { from: "2026-05-01", to: null }, TODAY)).toBe(
      false,
    );
  });

  it("utilise borne inférieure ouverte quand seulement to est défini", () => {
    expect(inRange("2026-01-01", { from: null, to: "2026-05-31" }, TODAY)).toBe(
      true,
    );
    expect(inRange("2026-06-01", { from: null, to: "2026-05-31" }, TODAY)).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
pnpm test src/test/ArchiveDateFilter.test.ts
```

Résultat attendu : FAIL — `inRange` n'existe pas encore.

---

### Task 3 : Créer `ArchiveDateFilter.tsx`

**Files:**

- Create: `src/components/layout/ArchiveDateFilter.tsx`

- [ ] **Step 1 : Créer le fichier**

Créer `src/components/layout/ArchiveDateFilter.tsx` avec ce contenu exact :

```tsx
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange as RdpRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDate, todayIso } from "@/lib/utils";

export type DateRange = { from: string | null; to: string | null };

export function inRange(
  date: string | null,
  range: DateRange,
  today: string,
): boolean {
  if (!range.from && !range.to) return true;
  if (!date) return false;
  const from = range.from ?? "0000-01-01";
  const to = range.to ?? today;
  return date >= from && date <= to;
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function buildPresets(today: string) {
  const base = isoToDate(today);
  const d7 = new Date(base);
  d7.setDate(d7.getDate() - 7);
  const d30 = new Date(base);
  d30.setDate(d30.getDate() - 30);
  const firstOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  return [
    { key: "7d" as const, from: dateToIso(d7), to: today },
    { key: "30d" as const, from: dateToIso(d30), to: today },
    { key: "month" as const, from: dateToIso(firstOfMonth), to: today },
  ];
}

interface DateSectionProps {
  label: string;
  range: DateRange;
  onChange: (r: DateRange) => void;
  presetLabels: [string, string, string];
  presets: ReturnType<typeof buildPresets>;
  locale: typeof fr | undefined;
  lang: string;
}

function DateSection({
  label,
  range,
  onChange,
  presetLabels,
  presets,
  locale,
  lang,
}: DateSectionProps) {
  const rdpSelected: RdpRange | undefined =
    range.from || range.to
      ? {
          from: range.from ? isoToDate(range.from) : undefined,
          to: range.to ? isoToDate(range.to) : undefined,
        }
      : undefined;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset, i) => {
          const active = range.from === preset.from && range.to === preset.to;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() =>
                onChange(
                  active
                    ? { from: null, to: null }
                    : { from: preset.from, to: preset.to },
                )
              }
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {presetLabels[i]}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={range.from ? "text-foreground" : "text-muted-foreground"}
        >
          {range.from ? formatDate(range.from, lang) : "Début…"}
        </span>
        <span className="text-muted-foreground">→</span>
        <span
          className={range.to ? "text-foreground" : "text-muted-foreground"}
        >
          {range.to ? formatDate(range.to, lang) : "Fin…"}
        </span>
      </div>
      <Calendar
        mode="range"
        selected={rdpSelected}
        onSelect={(rdp) =>
          onChange({
            from: rdp?.from ? dateToIso(rdp.from) : null,
            to: rdp?.to ? dateToIso(rdp.to) : null,
          })
        }
        locale={locale}
      />
    </div>
  );
}

interface ArchiveDateFilterProps {
  archivedRange: DateRange;
  onArchivedRangeChange: (r: DateRange) => void;
  dueDateRange: DateRange;
  onDueDateRangeChange: (r: DateRange) => void;
}

export function ArchiveDateFilter({
  archivedRange,
  onArchivedRangeChange,
  dueDateRange,
  onDueDateRangeChange,
}: ArchiveDateFilterProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const locale = i18n.language === "fr" ? fr : undefined;
  const lang = i18n.language;

  const activeCount =
    (archivedRange.from || archivedRange.to ? 1 : 0) +
    (dueDateRange.from || dueDateRange.to ? 1 : 0);
  const isActive = activeCount > 0;

  const presets = buildPresets(todayIso());
  const presetLabels: [string, string, string] = [
    t("archive.preset7d"),
    t("archive.preset30d"),
    t("archive.presetMonth"),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "w-36 h-7 px-2.5 text-xs border gap-1.5",
          isActive
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border/40 text-muted-foreground",
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">
          {isActive
            ? `${t("archive.filterDates")} · ${activeCount}`
            : t("archive.filterDates")}
        </span>
        <span className="text-[10px] opacity-40">▾</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="space-y-4">
          <DateSection
            label={t("archive.filterArchivedDate")}
            range={archivedRange}
            onChange={onArchivedRangeChange}
            presetLabels={presetLabels}
            presets={presets}
            locale={locale}
            lang={lang}
          />
          <div className="h-px bg-border/50" />
          <DateSection
            label={t("dueDate.label")}
            range={dueDateRange}
            onChange={onDueDateRangeChange}
            presetLabels={presetLabels}
            presets={presets}
            locale={locale}
            lang={lang}
          />
          {isActive && (
            <>
              <div className="h-px bg-border/50" />
              <button
                type="button"
                onClick={() => {
                  onArchivedRangeChange({ from: null, to: null });
                  onDueDateRangeChange({ from: null, to: null });
                }}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("filter.reset")}
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2 : Lancer les tests `inRange`**

```bash
pnpm test src/test/ArchiveDateFilter.test.ts
```

Résultat attendu : 9/9 tests passent.

- [ ] **Step 3 : Vérifier TypeScript**

```bash
pnpm tsc --noEmit
```

Résultat attendu : aucune erreur.

---

### Task 4 : Mettre à jour `ArchiveView`

**Files:**

- Modify: `src/components/layout/ArchiveView.tsx`

- [ ] **Step 1 : Ajouter l'import**

En tête de `src/components/layout/ArchiveView.tsx`, ajouter après l'import de `CalendarProjectFilter` :

```tsx
import {
  ArchiveDateFilter,
  type DateRange,
  inRange,
} from "@/components/layout/ArchiveDateFilter";
```

- [ ] **Step 2 : Ajouter les deux états de plage de date**

Dans le corps de `ArchiveView()`, après la ligne `const [filterProjectId, setFilterProjectId] = ...`, ajouter :

```tsx
const [archivedDateRange, setArchivedDateRange] = useState<DateRange>({
  from: null,
  to: null,
});
const [dueDateRange, setDueDateRange] = useState<DateRange>({
  from: null,
  to: null,
});
```

- [ ] **Step 3 : Mettre à jour `filteredTasks`**

Remplacer le `useMemo` de `filteredTasks` existant par :

```tsx
const filteredTasks = useMemo(() => {
  const today = todayIso();
  return archivedTasks.filter((task) => {
    const matchesSearch =
      !search.trim() || task.title.toLowerCase().includes(search.toLowerCase());
    const matchesProject =
      filterProjectId === undefined ||
      (filterProjectId === null
        ? task.projectId === null
        : task.projectId === filterProjectId);
    const archivedDate = task.deletedAt?.slice(0, 10) ?? null;
    const matchesArchivedDate = inRange(archivedDate, archivedDateRange, today);
    const matchesDueDate = inRange(task.dueDate, dueDateRange, today);
    return (
      matchesSearch && matchesProject && matchesArchivedDate && matchesDueDate
    );
  });
}, [archivedTasks, search, filterProjectId, archivedDateRange, dueDateRange]);
```

- [ ] **Step 4 : Ajouter `todayIso` aux imports si absent**

Vérifier que `todayIso` est importé depuis `@/lib/utils`. La ligne d'import existante est :

```tsx
import { formatDate } from "@/lib/utils";
```

La remplacer par :

```tsx
import { formatDate, todayIso } from "@/lib/utils";
```

- [ ] **Step 5 : Ajouter `<ArchiveDateFilter>` dans le header**

Dans le JSX du header (après `<CalendarProjectFilter ... />`), ajouter :

```tsx
<ArchiveDateFilter
  archivedRange={archivedDateRange}
  onArchivedRangeChange={setArchivedDateRange}
  dueDateRange={dueDateRange}
  onDueDateRangeChange={setDueDateRange}
/>
```

- [ ] **Step 6 : Vérifier TypeScript**

```bash
pnpm tsc --noEmit
```

Résultat attendu : aucune erreur.

- [ ] **Step 7 : Lancer tous les tests**

```bash
pnpm test
```

Résultat attendu : tous les tests passent (256+ tests, 28 fichiers).
