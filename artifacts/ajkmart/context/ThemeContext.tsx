import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import Colors from "@/constants/colors";

const DARK_MODE_KEY = "@ajkmart_dark_mode";

type ColorScheme = typeof Colors.light;

interface ThemeContextValue {
  isDark: boolean;
  colors: ColorScheme;
  toggleDarkMode: () => Promise<void>;
  setDarkMode: (enabled: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  colors: Colors.light,
  toggleDarkMode: async () => {},
  setDarkMode: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line ajk-local/no-silent-catch -- reading theme preference is non-critical; defaults to light mode
    AsyncStorage.getItem(DARK_MODE_KEY)
      .then((stored) => {
        if (stored === "true") setIsDark(true);
      })
      .catch(() => {});
  }, []);

  const setDarkMode = useCallback(async (enabled: boolean) => {
    setIsDark(enabled);
    try {
      await AsyncStorage.setItem(DARK_MODE_KEY, enabled ? "true" : "false");
    // eslint-disable-next-line ajk-local/no-silent-catch -- persisting dark mode preference is non-critical
    } catch {}
  }, []);

  const toggleDarkMode = useCallback(async () => {
    setIsDark((prev) => {
      const next = !prev;
      // eslint-disable-next-line ajk-local/no-silent-catch -- persisting toggled theme is non-critical
      AsyncStorage.setItem(DARK_MODE_KEY, next ? "true" : "false").catch(() => {});
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors: isDark ? Colors.dark : Colors.light,
        toggleDarkMode,
        setDarkMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
