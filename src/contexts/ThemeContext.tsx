import React, { createContext, useContext, useState, useEffect } from 'react';
import { applyDocumentTheme } from '../theme/applyDocumentTheme';

interface ThemeContextType {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    const saved = localStorage.getItem('retailos_darkmode');
    return saved === 'true';
  });

  const setDarkMode = (dark: boolean) => {
    setDarkModeState(dark);
    localStorage.setItem('retailos_darkmode', dark.toString());
    applyDocumentTheme(dark);
  };

  const toggleDarkMode = () => {
    setDarkModeState((prev) => {
      const newValue = !prev;
      localStorage.setItem('retailos_darkmode', newValue.toString());
      applyDocumentTheme(newValue);
      return newValue;
    });
  };

  useEffect(() => {
    applyDocumentTheme(darkMode);
  }, [darkMode]);

  return (
    <ThemeContext.Provider
      value={{
        darkMode,
        setDarkMode,
        toggleDarkMode,
      }}
    >
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
