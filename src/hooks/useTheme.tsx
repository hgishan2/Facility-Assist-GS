import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemeAccent = 'royal' | 'amber' | 'emerald';

export const THEME_ACCENTS: {
  id: ThemeAccent;
  label: string;
  shortLabel: string;
  swatchHex: string;
  description: string;
}[] = [
  {
    id: 'royal',
    label: 'Royal Blue',
    shortLabel: 'Royal',
    swatchHex: '#1d4ed8',
    description: 'Control-room slate & royal blue',
  },
  {
    id: 'amber',
    label: 'Field Amber',
    shortLabel: 'Amber',
    swatchHex: '#b45309',
    description: 'Carbon zinc & MEP safety amber',
  },
  {
    id: 'emerald',
    label: 'Tower Emerald',
    shortLabel: 'Emerald',
    swatchHex: '#047857',
    description: 'Deep pine slate & emerald',
  },
];

const MODE_STORAGE_KEY = 'siteledger_theme_mode';
const ACCENT_STORAGE_KEY = 'siteledger_theme_accent';

function readInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

function readInitialAccent(): ThemeAccent {
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (stored === 'royal' || stored === 'amber' || stored === 'emerald') return stored;
  } catch {
    // Ignore storage access errors
  }
  return 'royal';
}

interface ThemeContextValue {
  mode: ThemeMode;
  accent: ThemeAccent;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (accent: ThemeAccent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(readInitialMode);
  const [accent, setAccentState] = useState<ThemeAccent>(readInitialAccent);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    root.dataset.accent = accent;

    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
      localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    } catch {
      // Ignore storage errors
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        'content',
        mode === 'dark'
          ? '#020617'
          : accent === 'emerald'
            ? '#062820'
            : accent === 'amber'
              ? '#18181b'
              : '#0f172a'
      );
    }
  }, [mode, accent]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const toggleMode = useCallback(
    () => setModeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  );
  const setAccent = useCallback((next: ThemeAccent) => setAccentState(next), []);

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, toggleMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
