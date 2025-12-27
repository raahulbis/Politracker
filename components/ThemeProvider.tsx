'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    // Get initial theme from localStorage or system preference
    const getTheme = (): Theme => {
      try {
        const saved = localStorage.getItem('theme');
        if (saved === 'dark' || saved === 'light') {
          return saved;
        }
      } catch (e) {
        // localStorage not available
      }
      
      // Check system preference
      if (typeof window !== 'undefined') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
      }
      
      return 'light';
    };

    const initialTheme = getTheme();
    setThemeState(initialTheme);
    
    // Apply theme to DOM
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch (e) {
      // Ignore localStorage errors
    }
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    console.log('toggleTheme called');
    setThemeState((prev) => {
      console.log('toggleTheme: prev theme:', prev);
      const newTheme = prev === 'light' ? 'dark' : 'light';
      console.log('toggleTheme: new theme:', newTheme);
      try {
        localStorage.setItem('theme', newTheme);
        console.log('toggleTheme: saved to localStorage');
      } catch (e) {
        console.error('toggleTheme: localStorage error:', e);
      }
      
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
        console.log('toggleTheme: added dark class to html');
      } else {
        document.documentElement.classList.remove('dark');
        console.log('toggleTheme: removed dark class from html');
      }
      
      return newTheme;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      setTheme,
    }),
    [theme, toggleTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
