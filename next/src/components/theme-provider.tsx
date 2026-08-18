'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {Theme, ThemeProviderState} from '@/types'



type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};


const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = 'uxproof-theme',
}: ThemeProviderProps) {
  // ✅ Initialize with undefined — never touch localStorage here (runs on server too)
  const [theme, setTheme] = useState<Theme | undefined>(undefined);

  // ✅ Only read localStorage after mount (client-only)
  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null;
    if (stored) {
      setTheme(stored);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : defaultTheme);
    }
  }, [storageKey, defaultTheme]);

  // ✅ Apply class to <html> whenever theme resolves or changes
  useEffect(() => {
    if (!theme) return;
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme: theme ?? defaultTheme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};