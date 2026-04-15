import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeMode } from '@/theme/types';

interface ThemeToggleProps {
  readonly collapsed: boolean;
}

const MODES: { mode: ThemeMode; icon: React.ElementType; labelKey: 'theme.light' | 'theme.dark' | 'theme.system' }[] = [
  { mode: 'light', icon: Sun, labelKey: 'theme.light' },
  { mode: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { mode: 'system', icon: Monitor, labelKey: 'theme.system' },
];

const CYCLE_ORDER: ThemeMode[] = ['light', 'dark', 'system'];

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();

  if (collapsed) {
    const current = MODES.find((m) => m.mode === mode) ?? MODES[2];
    const Icon = current.icon;
    const nextIndex = (CYCLE_ORDER.indexOf(mode) + 1) % CYCLE_ORDER.length;
    const nextMode = CYCLE_ORDER[nextIndex];
    const nextModeEntry = MODES.find((m) => m.mode === nextMode) ?? MODES[0];

    return (
      <div className="px-2 py-2 flex justify-center border-t border-border">
        <button
          type="button"
          onClick={() => setMode(nextMode)}
          aria-label={t(nextModeEntry.labelKey)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1 px-2 py-2 border-t border-border">
      {MODES.map(({ mode: m, icon: Icon, labelKey }) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-label={t(labelKey)}
          aria-pressed={mode === m}
          className={cn(
            'flex-1 flex items-center justify-center py-1 rounded-md transition-colors',
            mode === m
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
