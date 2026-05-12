import { useEffect, createContext, useContext, useState, type ReactNode } from "react";
import type { Theme, ThemeMode } from "./types";
import { lightTheme } from "./themes/light";
import { darkTheme } from "./themes/dark";
import { luxuryTheme } from "./themes/luxury";
import { natureTheme } from "./themes/nature";
import { oceanTheme } from "./themes/ocean";
import { draculaTheme } from "./themes/dracula";
import { retroTheme } from "./themes/retro";
import { emberTheme } from "./themes/ember";
import { deepOceanTheme } from "./themes/deepOcean";

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

function isDarkTheme(mode: ThemeMode, prefersDark: boolean): boolean {
  if (mode === "system") return prefersDark;
  return mode === "dark" || mode === "dracula" || mode === "ember" || mode === "contrast" || mode === "deep-ocean";
}

function resolveTheme(mode: ThemeMode, prefersDark: boolean): Theme {
  if (mode === "system") return prefersDark ? darkTheme : lightTheme;
  if (mode === "dark") return darkTheme;
  if (mode === "light") return lightTheme;
  if (mode === "ocean") return oceanTheme;
  if (mode === "luxury") return luxuryTheme;
  if (mode === "nature") return natureTheme;
  if (mode === "dracula") return draculaTheme;
  if (mode === "retro") return retroTheme;
  if (mode === "ember") return emberTheme;
  if (mode === "contrast") return darkTheme;
  if (mode === "deep-ocean") return deepOceanTheme;
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
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = isDarkTheme(mode, prefersDark);
    document.documentElement.classList.toggle("dark", dark);
    applyTheme(resolveTheme(mode, prefersDark));
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
