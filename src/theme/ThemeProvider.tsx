import { useEffect, createContext, useContext, useState, type ReactNode } from "react";
import type { Theme, ThemeMode } from "./types";
import { lightTheme } from "./themes/light";
import { darkTheme } from "./themes/dark";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value);
  }
}

function resolveTheme(mode: ThemeMode, prefersDark: boolean): Theme {
  if (mode === "system") return prefersDark ? darkTheme : lightTheme;
  if (mode === "dark") return darkTheme;
  if (mode === "light") return lightTheme;
  // Custom theme: not yet implemented — fall back to system
  return prefersDark ? darkTheme : lightTheme;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultMode = "system" }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem("theme-mode") as ThemeMode) ?? defaultMode;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      if (mode === "system") {
        const theme = resolveTheme("system", mediaQuery.matches);
        applyTheme(theme);
        document.documentElement.classList.toggle("dark", mediaQuery.matches);
      }
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mode]);

  useEffect(() => {
    const isDark =
      mode === "dark" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    applyTheme(resolveTheme(mode, isDark));
  }, [mode]);

  function setMode(newMode: ThemeMode) {
    localStorage.setItem("theme-mode", newMode);
    setModeState(newMode);
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
