import React from 'react';
import { Moon, Palette, Sun } from 'lucide-react';
import { THEME_ACCENTS, useTheme } from '../hooks/useTheme';

interface ThemeSwitcherProps {
  variant?: 'sidebar' | 'compact';
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ variant = 'sidebar' }) => {
  const { mode, accent, toggleMode, setAccent } = useTheme();

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5" role="group" aria-label="Color theme">
          {THEME_ACCENTS.map((item) => {
            const active = accent === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAccent(item.id)}
                title={`${item.label} theme`}
                aria-label={`${item.label} theme`}
                aria-pressed={active}
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-transform cursor-pointer ${
                  active
                    ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-105'
                    : 'opacity-75 hover:opacity-100'
                }`}
                style={{ backgroundColor: item.swatchHex }}
              />
            );
          })}
        </div>

        <span className="h-4 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />

        <button
          type="button"
          onClick={toggleMode}
          aria-label={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white whitespace-nowrap cursor-pointer"
        >
          {mode === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-slate-600" />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-sidebar-surface/90 border border-sidebar-border space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
          <Palette className="w-3.5 h-3.5 text-brand-400" />
          Appearance
        </span>
        <button
          type="button"
          onClick={toggleMode}
          aria-label={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 bg-sidebar-bg text-[11px] font-medium text-slate-200 hover:text-white hover:border-slate-500 transition-colors whitespace-nowrap cursor-pointer"
        >
          {mode === 'dark' ? (
            <>
              <Sun className="w-3 h-3 text-amber-400" />
              Light
            </>
          ) : (
            <>
              <Moon className="w-3 h-3 text-slate-300" />
              Dark
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Accent color theme">
        {THEME_ACCENTS.map((item) => {
          const active = accent === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAccent(item.id)}
              aria-pressed={active}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-1.5 rounded text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-white/10 border-white/40 text-white'
                  : 'bg-transparent border-slate-700/80 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: item.swatchHex }}
              />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
